package de.ipvs.as.mbp.service.discovery.engine;

import de.ipvs.as.mbp.domain.discovery.collections.CandidateDevicesCollection;
import de.ipvs.as.mbp.domain.discovery.collections.CandidateDevicesRanking;
import de.ipvs.as.mbp.domain.discovery.collections.CandidateDevicesResult;
import de.ipvs.as.mbp.domain.discovery.deployment.DynamicDeployment;
import de.ipvs.as.mbp.domain.discovery.description.DeviceDescription;
import de.ipvs.as.mbp.domain.discovery.device.DeviceTemplate;
import de.ipvs.as.mbp.domain.discovery.topic.RequestTopic;
import de.ipvs.as.mbp.repository.discovery.DeviceTemplateRepository;
import de.ipvs.as.mbp.repository.discovery.DynamicDeploymentRepository;
import de.ipvs.as.mbp.repository.discovery.RequestTopicRepository;
import de.ipvs.as.mbp.service.discovery.engine.tasks.DiscoveryTask;
import de.ipvs.as.mbp.service.discovery.engine.tasks.TaskWrapper;
import de.ipvs.as.mbp.service.discovery.engine.tasks.dynamic.DeployByRankingTask;
import de.ipvs.as.mbp.service.discovery.engine.tasks.dynamic.DynamicDeploymentTask;
import de.ipvs.as.mbp.service.discovery.engine.tasks.dynamic.UndeployTask;
import de.ipvs.as.mbp.service.discovery.engine.tasks.template.DeleteCandidateDevicesTask;
import de.ipvs.as.mbp.service.discovery.engine.tasks.template.DeviceTemplateTask;
import de.ipvs.as.mbp.service.discovery.engine.tasks.template.MergeCandidateDevicesTask;
import de.ipvs.as.mbp.service.discovery.engine.tasks.template.UpdateCandidateDevicesTask;
import de.ipvs.as.mbp.service.discovery.gateway.CandidateDevicesSubscriber;
import de.ipvs.as.mbp.service.discovery.gateway.DiscoveryGateway;
import de.ipvs.as.mbp.service.discovery.processing.CandidateDevicesProcessor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationListener;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;

/**
 * This components manages the overall discovery process by orchestrating the various involved components and takes
 * care about the execution of discovery-related tasks.
 */
@Component
public class DiscoveryEngine implements ApplicationListener<ContextRefreshedEvent>, CandidateDevicesSubscriber {

    //Number of threads to use in the thread pool that executes the tasks
    private static final int THREAD_POOL_SIZE = 5;

    /*
    Auto-wired components
     */
    @Autowired
    private DiscoveryGateway discoveryGateway;

    @Autowired
    private CandidateDevicesProcessor candidateDevicesProcessor;

    @Autowired
    private RequestTopicRepository requestTopicRepository;

    @Autowired
    private DynamicDeploymentRepository dynamicDeploymentRepository;

    @Autowired
    private DeviceTemplateRepository deviceTemplateRepository;

    //Map (device template ID --> Queue) of task queues for device templates
    private final Map<String, Queue<TaskWrapper<DeviceTemplateTask>>> deviceTemplateTasks;

    //Map (dynamic deployment ID --> Queue) of task queues for dynamic deployments
    private final Map<String, Queue<TaskWrapper<DynamicDeploymentTask>>> dynamicDeploymentTasks;

    //Executor service for executing tasks
    private final ExecutorService executorService;

    /**
     * Creates the discovery engine.
     */
    public DiscoveryEngine() {
        //Initialize data structures
        this.dynamicDeploymentTasks = new HashMap<>();
        this.deviceTemplateTasks = new HashMap<>();

        //Initialize executor service
        this.executorService = Executors.newFixedThreadPool(THREAD_POOL_SIZE);
    }

    /**
     * Initializes the discovery engine.
     */
    @PostConstruct
    public void initialize() {
        /*
        Do not interact with the MongoDB here in different threads:
        https://github.com/spring-projects/spring-data-mongodb/issues/2452
         */
    }

    /**
     * Called as soon as the {@link ContextRefreshedEvent} is sent by the application. This method then takes care
     * of initializing the {@link DiscoveryEngine} by retrieving {@link DeviceTemplate}s and the corresponding
     * {@link DynamicDeployment}s that make use of them and checking and updating their status to the current
     * consitution of the IoT environment.
     *
     * @param event The {@link ContextRefreshedEvent} to wait for
     */
    @Override
    public void onApplicationEvent(ContextRefreshedEvent event) {
        //Iterate over all device templates
        for (DeviceTemplate deviceTemplate : this.deviceTemplateRepository.findAll()) {
            //Find all dynamic deployments that use the current device template
            List<DynamicDeployment> dynamicDeployments = this.dynamicDeploymentRepository.findByDeviceTemplate_Id(deviceTemplate.getId());

            /*
            Device template tasks
             */
            //Check if any of the found dynamic deployments are intended to be activated
            if (dynamicDeployments.stream().anyMatch(DynamicDeployment::isActivatingIntended)) {
                //Such dynamic deployments exist, so get request topics, update the candidate devices and subscribe
                List<RequestTopic> requestTopics = requestTopicRepository.findByOwner(deviceTemplate.getOwner().getId(), null);
                submitTask(new UpdateCandidateDevicesTask(deviceTemplate, requestTopics, this, true));
            } else {
                //No such dynamic deployments exist, so deletion of candidate devices and unsubscription is safe
                submitTask(new DeleteCandidateDevicesTask(deviceTemplate, true));
            }

            /*
            Dynamic deployments tasks
             */
            //Stream through all dynamic deployments of this device template
            dynamicDeployments.forEach(dynamicDeployment -> {
                //Check whether activating or de-activating is intended
                if (dynamicDeployment.isActivatingIntended()) {
                    //Dynamic deployment is intended to be activated, so submit corresponding deployment task
                    submitTask(new DeployByRankingTask(dynamicDeployment));
                } else {
                    //Dynamic deployment is intended to be deactivated, so submit corresponding un-deployment task
                    submitTask(new UndeployTask(dynamicDeployment));
                }
            });
        }

        //Trigger the execution of tasks
        executeTasks();
    }

    /**
     * Requests {@link DeviceDescription}s of suitable candidate devices which match a given {@link DeviceTemplate}
     * from the discovery repositories that are available under a given collection of {@link RequestTopic}s.
     * The {@link DeviceDescription}s of the candidate devices that are received from the discovery repositories
     * in response are processed, scored with respect to to the {@link DeviceTemplate} and transformed to a ranking,
     * which is subsequently returned as {@link CandidateDevicesRanking}.
     *
     * @param deviceTemplate The device template to find suitable candidate devices for
     * @param requestTopics  The collection of {@link RequestTopic}s to use for sending the request to the repositories
     * @return The resulting {@link CandidateDevicesRanking}
     */
    public CandidateDevicesRanking getRankedDeviceCandidates(DeviceTemplate deviceTemplate, Collection<RequestTopic> requestTopics) {
        //Sanity checks
        if (deviceTemplate == null) {
            throw new IllegalArgumentException("The device template must not be null.");
        } else if ((requestTopics == null) || requestTopics.isEmpty() || (requestTopics.stream().anyMatch(Objects::isNull))) {
            throw new IllegalArgumentException("The request topics must not be null or empty.");
        }

        //Use the gateway to find all candidate devices that match the device template
        CandidateDevicesResult candidateDevices = this.discoveryGateway.getDeviceCandidates(deviceTemplate, requestTopics);

        //Use the processor to filter, aggregate, score and rank the candidate devices
        return candidateDevicesProcessor.process(candidateDevices, deviceTemplate);
    }

    /**
     * Activates the deployment of a {@link DynamicDeployment}, given by its ID, by placing corresponding tasks
     * in the task queues. For the deployment, the device that appears most appropriate with respect to the
     * {@link DeviceTemplate} underlying the {@link DynamicDeployment} is used. In case the deployment fails, it is
     * tried again for the next most appropriate appearing devices.
     *
     * @param dynamicDeploymentId The ID of the dynamic deployment to deploy
     * @return True, if the activation succeeded; false, if the dynamic deployment was already activated
     */
    public synchronized boolean activateDynamicDeployment(String dynamicDeploymentId) {
        //Get dynamic deployment exclusively for activating
        DynamicDeployment dynamicDeployment = requestDynamicDeploymentExclusively(dynamicDeploymentId, true);

        //Null check
        if (dynamicDeployment == null) {
            return false;
        }

        //Get all request topics of the user
        List<RequestTopic> requestTopics = requestTopicRepository.findByOwner(dynamicDeployment.getOwner().getId(), null);

        //Submit task for retrieving candidate devices (will abort if not needed due to force=false)
        submitTask(new UpdateCandidateDevicesTask(dynamicDeployment.getDeviceTemplate(), requestTopics, false));

        //Submit task for deploying the dynamic deployment
        submitTask(new DeployByRankingTask(dynamicDeployment));

        //Trigger the execution of tasks
        executeTasks();

        return true;
    }

    /**
     * Deactivates the deployment of a {@link DynamicDeployment}, given by its ID, by placing corresponding tasks
     * in the task queues. Furthermore, the activation of the {@link DynamicDeployment} is directly updated to false.
     *
     * @param dynamicDeploymentId The ID of the dynamic deployment to undeploy
     * @return True, if the deactivation succeeded; false, if the dynamic deployment was already deactivated
     */
    public synchronized boolean deactivateDynamicDeployment(String dynamicDeploymentId) {
        //Get dynamic deployment exclusively for deactivating
        DynamicDeployment dynamicDeployment = requestDynamicDeploymentExclusively(dynamicDeploymentId, false);

        //Null check
        if (dynamicDeployment == null) {
            return false;
        }

        //Submit task for potentially deleting candidate devices data and cancel subscriptions
        submitTask(new DeleteCandidateDevicesTask(dynamicDeployment.getDeviceTemplate()));

        //Submit task for undeploying the dynamic deployment
        submitTask(new UndeployTask(dynamicDeployment));

        //Trigger the execution of tasks
        executeTasks();

        return true;
    }

    /**
     * Called in case a notification was received from a repository as result of a subscription,
     * indicating that the collection of suitable candidate devices, which can be determined on behalf of a
     * certain {@link DeviceTemplate}, changed over time.
     *
     * @param deviceTemplate          The device template whose candidate devices are affected
     * @param repositoryName          The name of the repository that issued the notification
     * @param updatedCandidateDevices The updated collection of candidate devices as {@link CandidateDevicesCollection}
     */
    @Override
    public synchronized void onDeviceTemplateResultChanged(DeviceTemplate deviceTemplate, String repositoryName, CandidateDevicesCollection updatedCandidateDevices) {
        //Sanity checks
        if ((deviceTemplate == null) || (repositoryName == null) || (repositoryName.isEmpty()) || (updatedCandidateDevices == null)) {
            return;
        }

        //Create task for merging the updated candidate devices with the existing ones
        submitTask(new MergeCandidateDevicesTask(deviceTemplate, repositoryName, updatedCandidateDevices));

        //Iterate over all dynamic deployments that use the affected device template
        this.dynamicDeploymentRepository.findByDeviceTemplate_Id(deviceTemplate.getId())
                .forEach(d -> submitTask(new DeployByRankingTask(d))); //Submit re-deployment task for each
    }

    /**
     * Submits a given {@link DeviceTemplateTask} so that it can be added to the corresponding task queue
     * and be scheduled for asynchronous execution.
     *
     * @param task The task to submit
     */
    private synchronized void submitTask(DeviceTemplateTask task) {
        //Delegate call
        this.addTaskToQueueMap(task, this.deviceTemplateTasks, task.getDeviceTemplateId());
    }

    /**
     * Submits a given {@link DynamicDeploymentTask} so that it can be added to the corresponding task queue
     * and be scheduled for asynchronous execution.
     *
     * @param task The task to submit
     */
    private synchronized void submitTask(DynamicDeploymentTask task) {
        //Delegate call
        this.addTaskToQueueMap(task, this.dynamicDeploymentTasks, task.getDynamicDeploymentId());
    }

    /**
     * Adds a given {@link DiscoveryTask} to a given {@link Map} (queue ID --> queue) of {@link Queue}s. In order to
     * identify the queue that matches the given task, a queue ID is provided. If the queue does not already exist
     * in the queue map, it will be created and added.
     *
     * @param task     The task to add
     * @param queueMap The queue map (queue ID --> queue) to which the task is supposed to be added
     * @param queueId  The ID of the queue that matches the task
     * @param <T>      The type of the task
     */
    private synchronized <T extends DiscoveryTask> void addTaskToQueueMap(T task, Map<String, Queue<TaskWrapper<T>>> queueMap, String queueId) {
        //Null check
        if (task == null) {
            throw new IllegalArgumentException("The task must not be null.");
        }

        //Ignore task if ID is invalid
        if ((queueId == null) || (queueId.isEmpty())) return;

        //Check if there is already a queue with this ID
        if (queueMap.containsKey(queueId)) {
            //Add task to dedicated queue
            queueMap.get(queueId).add(new TaskWrapper<>(task));
        } else {
            //Create new queue and add the task
            LinkedList<TaskWrapper<T>> newQueue = new LinkedList<>();
            newQueue.add(new TaskWrapper<>(task));

            //Add queue to queue map
            queueMap.put(queueId, newQueue);
        }
        
        /*
        Remark: All tasks implement mechanisms in order to ensure that no unnecessary or time-consuming actions are executed, 
        mostly by checking the activationIntentions of the dynamic deployments and whether the device template is currently in use.
        However, when the queue looks like "Undeploy -> Deploy -> Undeploy -> Deploy" (ending with a deployment), then all undeploy
        tasks will not be executed/terminate qucikly due to the activation intention, but all deploy tasks will be executed and check whether
        there is currently a better device available. While minor improvements are possible (remember and check whether the current device is 
        number one of the current ranking with an additional flag), the general behaviour is probably desired, because this way user can re-trigger
        the check for the optimal deployment device in case the operator was not deployed on the best device during the first try due to deployment failures.
        */
    }

    private synchronized void executeTasks() {
        /* Rules:
        - Only first task in each queue is executed and remains in queue during its execution
        - After the execution of a task concluded, the task is removed from the queue
        - No dynamic deployment task is started as long as there is a task in the queue for the corresponding device template
        - No device template task is started as long as there is a currently running dynamic deployment task for a dynamic deployment that uses the template
        - Device template tasks are checked before dynamic deployment tasks

        Result: When a new device template task and a dynamic deployment task are added, old dynamic deployment tasks
        are executed first, then the new device template task, then the new dynamic deployment task.
         */

        /*
        Device template tasks
         */
        //Iterate through all available device template queues
        for (Queue<TaskWrapper<DeviceTemplateTask>> queue : this.deviceTemplateTasks.values()) {
            //Peek first task
            TaskWrapper<DeviceTemplateTask> firstTask = queue.peek();

            //Null check
            if (firstTask == null) continue;

            //Check if task has already been started
            if (firstTask.isStarted()) continue;

            //Get device template ID of the first task
            String deviceTemplateId = firstTask.getTask().getDeviceTemplateId();

            //Check if there is a currently running task for a dynamic deployment that uses the same device template
            if ((deviceTemplateId == null) || this.dynamicDeploymentTasks.values().stream()
                    .flatMap(Collection::stream).filter(TaskWrapper::isStarted)
                    .anyMatch(x -> deviceTemplateId.equals(x.getTask().getDeviceTemplateId()))) {
                continue;
            }

            //Task passed all checks, so execute it asynchronously
            executeTaskAsynchronously(firstTask);
        }

        /*
        Dynamic deployment tasks
         */
        //Iterate through all available dynamic deployment queues
        for (Queue<TaskWrapper<DynamicDeploymentTask>> queue : this.dynamicDeploymentTasks.values()) {
            //Peek first task
            TaskWrapper<DynamicDeploymentTask> firstTask = queue.peek();

            //Null check
            if (firstTask == null) continue;

            //Check if task has already been started
            if (firstTask.isStarted()) continue;

            //Check if task is blocked due to a device template task with same device template ID
            String deviceTemplateId = firstTask.getTask().getDeviceTemplateId();
            if ((this.deviceTemplateTasks.containsKey(deviceTemplateId)) && (!this.deviceTemplateTasks.get(deviceTemplateId).isEmpty())) {
                continue;
            }

            //Task passed all checks, so execute it asynchronously
            executeTaskAsynchronously(firstTask);
        }
    }

    /**
     * Prepares and starts the asynchronous execution of a given {@link DiscoveryTask}, wrapped in a
     * {@link TaskWrapper} object, as {@link CompletableFuture}. After the task concluded, it is automatically
     * removed from its corresponding task queue.
     *
     * @param task The task to execute
     */
    private synchronized void executeTaskAsynchronously(TaskWrapper<? extends DiscoveryTask> task) {
        //Sanity check
        if (task == null) {
            return;
        }

        //Mark task as started
        task.setStarted();

        //Run the task using a completable future and add a completion handler
        CompletableFuture.runAsync(task, executorService)
                .thenAccept(unused -> handleCompletedTask(task));
    }

    /**
     * Handles a given task, wrapped in a {@link TaskWrapper} object, whose execution completed by removing
     * it from the corresponding task queue.
     *
     * @param completedTask The completed task to handle
     */
    private synchronized void handleCompletedTask(TaskWrapper<? extends DiscoveryTask> completedTask) {
        //Check if task really completed
        if (!completedTask.isDone()) return;

        //Retrieve actual task from wrapper
        DiscoveryTask task = completedTask.getTask();

        //Check type of the task
        if (task instanceof DeviceTemplateTask) {
            //Get ID of device template
            String deviceTemplateId = ((DeviceTemplateTask) task).getDeviceTemplateId();
            //Get corresponding device template queue
            Queue<TaskWrapper<DeviceTemplateTask>> queue = this.deviceTemplateTasks.get(deviceTemplateId);
            //Remove task from the queue
            queue.remove(completedTask);
            //If empty, remove queue from map
            if (queue.isEmpty()) {
                this.deviceTemplateTasks.remove(deviceTemplateId);
            }
        } else if (task instanceof DynamicDeploymentTask) {
            //Get ID of dynamic deployment
            String dynamicDeploymentId = ((DynamicDeploymentTask) task).getDynamicDeploymentId();
            //Get corresponding device template queue
            Queue<TaskWrapper<DynamicDeploymentTask>> queue = this.dynamicDeploymentTasks.get(dynamicDeploymentId);
            //Remove task from the queue
            queue.remove(completedTask);
            //If empty, remove queue from map
            if (queue.isEmpty()) {
                this.dynamicDeploymentTasks.remove(dynamicDeploymentId);
            }
        }

        //Execute next tasks (if available)
        executeTasks();
    }

    /**
     * Retrieves and returns a {@link DynamicDeployment} of a given ID from its repository and updates its activation
     * intention to a given target value. Thereby, it is checked whether the intention of the {@link DynamicDeployment}
     * has already been updated previously to the target value. If this is the case, null will be returned instead of
     * the object. This way, it is ensured that the thread that wants to update the activation intention of the
     * {@link DynamicDeployment} and succeeds in doing so receives exclusive access to the {@link DynamicDeployment}
     * for the scope of its operation, thus avoiding the duplicated execution of operations with the same intention.
     *
     * @param dynamicDeploymentId The ID of the dynamic deployment to retrieve
     * @param enablingIntention   The target intention to set where true means active and false inactive
     * @return The {@link DynamicDeployment} or null if access could not be granted
     */
    private synchronized DynamicDeployment requestDynamicDeploymentExclusively(String dynamicDeploymentId, boolean enablingIntention) {
        //Read dynamic deployment from repository
        Optional<DynamicDeployment> dynamicDeployment = this.dynamicDeploymentRepository.findById(dynamicDeploymentId);

        //Check if dynamic deployment was found
        if (!dynamicDeployment.isPresent()) {
            throw new IllegalArgumentException("The dynamic deployment with the given ID does not exist.");
        }

        //Check if target status is already present
        if (dynamicDeployment.get().isActivatingIntended() == enablingIntention) {
            //Target status is already present, so do not continue
            return null;
        }

        //Set the target status
        dynamicDeployment.get().setActivatingIntended(enablingIntention);

        //Write updated deployment to repository and return it
        return this.dynamicDeploymentRepository.save(dynamicDeployment.get());
    }

    /**
     * Prints the contents of the {@link DeviceTemplate} task queues and the {@link DynamicDeployment}s task queues
     * to the standard output for debugging purposes.
     */
    private synchronized void printQueues() {
        System.out.println("------------------------------------");
        /*
        Device template queues
         */
        System.out.println("Device templates: ");

        //Stream through the device template queues
        this.deviceTemplateTasks.forEach((s, queue) -> {
            //Print device template ID
            System.out.printf("%s: ", s);

            //Stream through the queue elements, get their descriptions and join them
            System.out.println(queue.stream().map(t -> t.getTask().toHumanReadableString()).collect(Collectors.joining(" --> ")));
        });

        /*
        Dynamic deployment queues
         */
        System.out.println("\nDynamic deployments: ");

        //Stream through the dynamic deployment queues
        this.dynamicDeploymentTasks.forEach((s, queue) -> {
            //Print device template ID
            System.out.printf("%s: ", s);

            //Stream through the queue elements, get their descriptions and join them
            System.out.println(queue.stream().map(t -> t.getTask().toHumanReadableString()).collect(Collectors.joining(" --> ")));
        });

        System.out.println("------------------------------------");
    }
}
