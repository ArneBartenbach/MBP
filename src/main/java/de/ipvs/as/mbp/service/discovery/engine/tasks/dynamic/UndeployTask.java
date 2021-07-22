package de.ipvs.as.mbp.service.discovery.engine.tasks.dynamic;

import de.ipvs.as.mbp.DynamicBeanProvider;
import de.ipvs.as.mbp.domain.discovery.deployment.DynamicDeployment;
import de.ipvs.as.mbp.domain.discovery.deployment.DynamicDeploymentDeviceDetails;
import de.ipvs.as.mbp.domain.discovery.deployment.DynamicDeploymentState;
import de.ipvs.as.mbp.domain.discovery.device.DeviceTemplate;
import de.ipvs.as.mbp.domain.operator.Operator;
import de.ipvs.as.mbp.repository.discovery.DynamicDeploymentRepository;
import de.ipvs.as.mbp.service.discovery.deployment.DiscoveryDeploymentService;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;

/**
 * The purpose of this task is to undeploy the {@link Operator} of a given {@link DynamicDeployment}
 * from the device that is referenced as {@link DynamicDeploymentDeviceDetails} in the {@link DynamicDeployment},
 * in case the {@link DynamicDeployment} is deployed on it.
 */
public class UndeployTask implements DynamicDeploymentTask {

    //Whether this tasks requires access to the candidate devices
    private static final boolean DEPENDS_ON_CANDIDATE_DEVICES = false;

    //The original version of the dynamic deployment that is supposed to be deployed
    private DynamicDeployment originalDynamicDeployment;

    /*
    Injected fields
     */
    private final DiscoveryDeploymentService discoveryDeploymentService;
    private final DynamicDeploymentRepository dynamicDeploymentRepository;
    private final MongoTemplate mongoTemplate;

    /**
     * Creates a new {@link UndeployTask} from a given {@link DynamicDeployment}.
     *
     * @param dynamicDeployment The dynamic deployment to use
     */
    public UndeployTask(DynamicDeployment dynamicDeployment) {
        //Set fields
        setDynamicDeployment(dynamicDeployment);

        //Inject components
        this.discoveryDeploymentService = DynamicBeanProvider.get(DiscoveryDeploymentService.class);
        this.dynamicDeploymentRepository = DynamicBeanProvider.get(DynamicDeploymentRepository.class);
        this.mongoTemplate = DynamicBeanProvider.get(MongoTemplate.class);
    }

    /**
     * Implements the actual operations of the task. It is recommended to check for Thread interruptions in order to
     * gracefully deal with cancellations of the task.
     */
    @Override
    public void run() {
        //Read dynamic deployment from the repository
        DynamicDeployment dynamicDeployment = dynamicDeploymentRepository.findById(this.originalDynamicDeployment.getId()).orElse(null);

        //Sanity checks
        if (dynamicDeployment == null) {
            //Task ends because data is not available
            return;
        }

        //Check intention for dynamic deployment
        if (dynamicDeployment.isActivatingIntended()) {
            //De-activate is not intended, so no need to undeploy
            return;
        }

        //Check whether the dynamic deployment is currently deployed
        if ((dynamicDeployment.getLastDeviceDetails() == null) ||
                (!this.discoveryDeploymentService.isDeployed(dynamicDeployment))) {
            //Dynamic deployment is not deployed, so just update the state
            updateDynamicDeployment(dynamicDeployment.getId(), null, DynamicDeploymentState.DISABLED);
            return;
        }

        //Dynamic deployment is deployed, so undeploy it
        this.discoveryDeploymentService.undeploy(dynamicDeployment);

        //Update state of dynamic deployment accordingly
        updateDynamicDeployment(dynamicDeployment.getId(), null, DynamicDeploymentState.DISABLED);
    }

    /**
     * Updates the last device details and last state field of a certain {@link DynamicDeployment}, given by its
     * ID, in its repository. By using this method instead of the {@link DynamicDeploymentRepository},
     * lost updates on other fields can be avoided.
     *
     * @param dynamicDeploymentId The ID of the {@link DynamicDeployment} to update
     * @param newDeviceDetails    The new device details to set
     * @param newState            The new state to set
     */
    private void updateDynamicDeployment(String dynamicDeploymentId, DynamicDeploymentDeviceDetails newDeviceDetails, DynamicDeploymentState newState) {
        //Create query and update clauses
        Query query = Query.query(Criteria.where("id").is(dynamicDeploymentId));
        Update update = new Update().set("lastDeviceDetails", newDeviceDetails).set("lastState", newState);

        //Write changes to repository
        mongoTemplate.updateFirst(query, update, DynamicDeployment.class);
    }

    /**
     * Returns the {@link DynamicDeployment} object that has been originally passed to this task and is
     * supposed to be (re-)deployed.
     *
     * @return The dynamic deployment
     */
    public DynamicDeployment getDynamicDeployment() {
        return this.originalDynamicDeployment;
    }

    /**
     * Sets the {@link DynamicDeployment} that is supposed to be (re-)deployed within this task.
     *
     * @param dynamicDeployment The dynamic deployment to set
     */
    private void setDynamicDeployment(DynamicDeployment dynamicDeployment) {
        //Null check
        if (dynamicDeployment == null) {
            throw new IllegalArgumentException("The dynamic deployment must not be null.");
        }

        this.originalDynamicDeployment = dynamicDeployment;
    }

    /**
     * Returns the ID of the {@link DynamicDeployment} on which this task operates.
     *
     * @return The dynamic deployment ID
     */
    @Override
    public String getDynamicDeploymentId() {
        return this.originalDynamicDeployment.getId();
    }


    /**
     * Returns the ID of the device template that is used by the {@link DynamicDeployment} on which this task operates.
     *
     * @return The device template ID
     */
    @Override
    public String getDeviceTemplateId() {
        return this.originalDynamicDeployment.getDeviceTemplate().getId();
    }

    /**
     * Returns whether this task requires access to the candidate devices of the {@link DeviceTemplate} that is
     * referenced in the {@link DynamicDeployment}.
     *
     * @return True, if this task depends on the candidate devices; false otherwise
     */
    @Override
    public boolean dependsOnCandidateDevices() {
        return DEPENDS_ON_CANDIDATE_DEVICES;
    }

    /**
     * Returns whether this task was created on behalf of an user.
     *
     * @return True, if the task was created on behalf of an user; false otherwise
     */
    @Override
    public boolean isUserCreated() {
        return true;
    }

    /**
     * Returns a simple, short and human-readable description of the task.
     *
     * @return The human-readable description
     */
    @Override
    public String toHumanReadableString() {
        return "[Undeploy]";
    }
}
