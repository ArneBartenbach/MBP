/* global app */


/**
 * Controller for the sensor list page.
 */
app.controller('TestingController',
    ['$scope', '$controller', '$interval', '$http', 'testList', '$rootScope', 'addTest', 'deleteTest', 'ruleList', '$q', 'ComponentService', 'FileReader', 'ENDPOINT_URI', 'NotificationService',
        function ($scope, $controller, $interval, $http, testList, $rootScope, addTest, deleteTest, ruleList, $q, ComponentService, FileReader, ENDPOINT_URI, NotificationService) {

            const vm = this;
            vm.ruleList = ruleList;
            //Stores the parameters and their values as assigned by the user
            vm.parameterValues = [];
            //Settings objects that contains application settings for this page
            vm.useNewData = true;
            vm.testName = "";
            vm.rulesPDF = [];
            vm.availableSensors = [];
            const sensorList = ['TestingTemperaturSensor', 'TestingTemperaturSensorPl', 'TestingFeuchtigkeitsSensor', 'TestingFeuchtigkeitsSensorPl', 'TestingBeschleunigungsSensor', 'TestingBeschleunigungsSensorPl', 'TestingGPSSensor', 'TestingGPSSensorPl'];

            vm.test = "";


            /**
             * Initializing function, sets up basic things.
             */
            (function initController() {
                vm.availableSensors = [];
                //Check if the test list was retrieved successfully
                if (testList == null) {
                    NotificationService.notify("Could not retrieve test list.", "error");
                }

                getDevice();
                checkActuatorReg();
                for (let i = 0; i < sensorList.length; i++) {
                    checkSensorReg(sensorList[i]);
                }

                $scope.availableSensors = vm.availableSensors;

                //Interval for updating sensor states on a regular basis
                const interval = $interval(function () {
                    getDevice();
                    //   checkActuatorReg();
                    //  checkSensorReg();
                }, 5 * 60 * 1000);

                //Refresh test select picker when the modal is opened
                $('.modal').on('shown.bs.modal', function () {
                    $('.selectpicker').selectpicker('refresh');
                });

                //Cancel interval on route change
                $scope.$on('$destroy', function () {
                    $interval.cancel(interval);
                });
            })();

            /**
             * Performs a server request in order to start a test given by its id.
             *
             * @param testId
             * @param item
             */
            function executeTest(testId, item) {
                $http.post(ENDPOINT_URI + '/test-details/test/' + testId, testId.toString()).success(function successCallback(responseTest) {
                }, function (response) {
                });
            }

            /**
             * Performs a server request in order to stop a test given by its id.
             *
             * @param testId
             */
            function stopTest(testId) {
                vm.http = $http.post(ENDPOINT_URI + '/test-details/test/stop/' + testId, testId.toString()).then(function (response) {
                }, function (response) {
                });

            }


            /**
             * Sends a server request to find out if a test report is available for the specific test.
             *
             * @param testId
             * @param testName
             */
            function refreshTestEntry(testId, testName) {

                $http.get(ENDPOINT_URI + '/test-details/pdfExists/' + testId).then(function (response) {

                    if (response.data === "true") {
                        document.getElementById(testName).disabled = false;
                    } else if (response.data === "false") {

                        document.getElementById(testName).disabled = true;
                    }
                });
            }


            /**
             * Sends a server request to open the test report of a specific test fiven by its id.
             *
             * @param testID
             */
            function downloadPDF(testID, endtimeUnix) {
                window.open('api/test-details/downloadPDF/' + testID + "_" + endtimeUnix, '_blank');
            }


            /**
             * Check if Test-Device is already registered or not.
             */
            function getDevice() {
                $http.get(ENDPOINT_URI + '/devices/search/findAll').success(function (response) {

                    $scope.device = 'LOADING';

                    $scope.device = "NOT_REGISTERED";
                    angular.forEach(response._embedded.devices, function (value) {
                        if (value.name === "TestingDevice") {
                            $scope.device = "REGISTERED";
                        }
                    });
                });
            }

            /**
             * Register Test Device and update the registered status.
             */
            function registerTestDevice() {
                param =
                    {
                        "name": "TestingDevice",
                        "componentType": "Computer",
                        "ipAddress": "192.168.221.167",
                        "username": "ubuntu",
                        "password": "simulation",
                        "errors": {}
                    };
                $http.post(ENDPOINT_URI + '/devices/', param).then(function success(response) {
                    getDevice();
                    //Notify the user
                    NotificationService.notify('Entity successfully created.', 'success')
                });

            }

            /**
             * Check if Actuator simulator is already registered or not.
             */
            function checkActuatorReg() {
                $http.get(ENDPOINT_URI + '/actuators/search/findAll').success(function (response) {
                    registered = "NOT_REGISTERED";
                    angular.forEach(response._embedded.actuators, function (value) {
                        if (value.name === "TestingActuator") {
                            registered = "REGISTERED";
                        }
                    });
                    $scope.testingActuator = registered;
                });

            }

            /**
             * Register the Actuator-Simulator for the Test of IoT-Applications.
             */
            function registerTestingActuator() {
                adaptersExists = false;
                deviceExists = false;

                // Check if the required Adapter for the actuator simulator exists
                $http.get(ENDPOINT_URI + '/adapters/search/findAll').success(function (response) {
                    angular.forEach(response._embedded.adapters, function (value) {
                        if (value.name === "TestingActuator") {
                            adapterLink = value._links.self.href;
                            adaptersExists = true;
                        }
                    });

                    // Check if the required Testing device for the actuator simulator exists
                    $http.get(ENDPOINT_URI + '/devices/search/findAll').success(function (response) {
                        angular.forEach(response._embedded.devices, function (value) {
                            if (value.name === "TestingDevice") {
                                deviceLink = value._links.self.href;
                                deviceExists = true;
                            }
                        });

                        // if the specific adapter and the Testing device exists a server request for the registration is performed
                        if (deviceExists && adaptersExists) {

                            // Parameters for the actuator simulator registration
                            param = {
                                "name": "TestingActuator",
                                "componentType": "Buzzer",
                                "adapter": adapterLink,
                                "device": deviceLink,
                                "errors": {}
                            };

                            // Server request for the registration of the testing actuator
                            $http.post(ENDPOINT_URI + '/actuators/', param).then(function success(response) {
                                checkActuatorReg();

                                //Notify the user if actuator is successfully registered
                                NotificationService.notify('Entity successfully created.', 'success')
                            });

                        } else if (!deviceExists && adaptersExists) {
                            // Notify the user if the required Test device for the registration doesn't exist
                            NotificationService.notify("Please register the Testing device first.", "error");
                        } else if (deviceExists && !adaptersExists) {
                            // Notify the user if the required Adapter for the registration doesn't exist
                            NotificationService.notify("Please register the corresponding adapter first.", "error");
                        } else if (!deviceExists && !adaptersExists) {
                            // Notify the user if the required Adapter and Test device for the registration doesn't exist
                            NotificationService.notify("Please register the corresponding adapter and Testing device first.", "error");
                        }
                    });

                });

            }


            /**
             * Check if the Sensor-Simulator for the Test is registered.
             *
             * @param sensor
             */
            function checkSensorReg(sensor) {
                $http.get(ENDPOINT_URI + '/sensors/search/findAll').success(function (response) {
                    sensorX = false;
                    sensorY = false;
                    sensorZ = false;
                    registered = "NOT_REGISTERED";
                    angular.forEach(response._embedded.sensors, function (value) {
                        if (sensor === 'TestingTemperaturSensor' || sensor === 'TestingTemperaturSensorPl' || sensor === 'TestingFeuchtigkeitsSensorPl' || sensor === 'TestingFeuchtigkeitsSensor') {
                            if (value.name === sensor) {
                                registered = "REGISTERED";
                                vm.availableSensors.push(sensor);
                            }
                        } else if (sensor === 'TestingBeschleunigungsSensor') {
                            if (value.name === "TestingAccelerationX") {
                                sensorX = true;
                            } else if (value.name === "TestingAccelerationY") {
                                sensorY = true;
                            } else if (value.name === "TestingAccelerationZ") {
                                sensorZ = true;
                            }

                        } else if (sensor === 'TestingBeschleunigungsSensorPl') {
                            if (value.name === "TestingAccelerationPlX") {
                                sensorX = true;
                            } else if (value.name === "TestingAccelerationPlY") {
                                sensorY = true;
                            } else if (value.name === "TestingAccelerationPlZ") {
                                sensorZ = true;
                            }

                        } else if (sensor === "TestingGPSSensor") {
                            if (value.name === "TestingGPSLatitude") {
                                sensorX = true;
                            } else if (value.name === "TestingGPSLongitude") {
                                sensorY = true;
                            } else if (value.name === "TestingGPSHight") {
                                sensorZ = true;
                            }
                        } else if (sensor === "TestingGPSSensor") {
                            if (value.name === "TestingGPSLatitudePl") {
                                sensorX = true;
                            } else if (value.name === "TestingGPSLongitudePl") {
                                sensorY = true;
                            } else if (value.name === "TestingGPSHightPl") {
                                sensorZ = true;
                            }
                        }

                    });

                    if (sensor === 'TestingTemperaturSensor') {
                        $scope.temp = registered;
                    } else if (sensor === 'TestingTemperaturSensorPl') {
                        $scope.tempPl = registered;
                    } else if (sensor === 'TestingFeuchtigkeitsSensor') {
                        $scope.hum = registered;
                    } else if (sensor === 'TestingFeuchtigkeitsSensorPl') {
                        $scope.humPl = registered;
                    } else if (sensor === 'TestingBeschleunigungsSensor') {
                        if (sensorX && sensorY && sensorZ) {
                            $scope.acc = "REGISTERED";
                            vm.availableSensors.push(sensor);
                        } else {
                            $scope.acc = "NOT_REGISTERED";
                        }
                    } else if (sensor === 'TestingBeschleunigungsSensorPl') {
                        if (sensorX && sensorY && sensorZ) {
                            $scope.accPl = "REGISTERED";
                            vm.availableSensors.push(sensor);
                        } else {
                            $scope.accPl = "NOT_REGISTERED";
                        }
                    } else if (sensor === 'TestingGPSSensor') {
                        if (sensorX && sensorY && sensorZ) {
                            $scope.gps = "REGISTERED";
                            vm.availableSensors.push(sensor);
                        } else {
                            $scope.gps = "NOT_REGISTERED";
                        }
                    } else if (sensor === 'TestingGPSSensorPl') {
                        if (sensorX && sensorY && sensorZ) {
                            $scope.gpsPl = "REGISTERED";
                            vm.availableSensors.push(sensor);
                        } else {
                            $scope.gpsPl = "NOT_REGISTERED";
                        }
                    }

                });

            }

            /**
             * Register the one dimensional Sensor-Simulator for the Test of IoT-Applications.
             */
            function registerOneDimSensor(sensor) {
                adaptersExists = false;
                deviceExists = false;

                // Check if the required Adapter for the specific sensor exists
                $http.get(ENDPOINT_URI + '/adapters/search/findAll').success(function (response) {
                    angular.forEach(response._embedded.adapters, function (value) {
                        if (value.name === sensor) {
                            sensorName = sensor;
                            adapterLink = value._links.self.href;
                            adaptersExists = true;
                        }
                    });

                    // Check if the required Testing device for the specific sensor exists
                    $http.get(ENDPOINT_URI + '/devices/search/findAll').success(function (response) {
                            angular.forEach(response._embedded.devices, function (value) {
                                if (value.name === "TestingDevice") {
                                    deviceLink = value._links.self.href;
                                    deviceExists = true;
                                }
                            });

                            // if the specific adapter and the Testing device exists a server request for the registration is performed
                            if (deviceExists && adaptersExists) {
                                if (sensor === "TestingTemperaturSensor" || sensor === "TestingTemperaturSensorPl") {
                                    componentType = "Temperature";
                                } else if (sensor === "TestingFeuchtigkeitsSensor" || sensor === "TestingFeuchtigkeitsSensorPl") {
                                    componentType = "Humidity";
                                }

                                // Parameters for the sensor simulator registration
                                param = {
                                    "name": sensorName,
                                    "componentType": componentType,
                                    "adapter": adapterLink,
                                    "device": deviceLink,
                                    "errors": {}
                                };

                                // Server request for the registration of the specific sensor
                                $http.post(ENDPOINT_URI + '/sensors/', param).then(function success(response) {
                                    checkSensorReg(sensor);

                                    //Notify the user if specific sensor is successfully registered
                                    NotificationService.notify('Entity successfully created.', 'success')
                                });

                            } else if (!deviceExists && adaptersExists) {
                                // Notify the user if the required Test device for the registration doesn't exist
                                NotificationService.notify("Please register the Testing device first.", "error");
                            } else if (deviceExists && !adaptersExists) {
                                // Notify the user if the required Adapter for the registration doesn't exist
                                NotificationService.notify("Please register the corresponding adapter first.", "error");
                            } else if (!deviceExists && !adaptersExists) {
                                // Notify the user if the required Adapter and Test device for the registration doesn't exist
                                NotificationService.notify("Please register the corresponding adapter and Testing device first.", "error");
                            }
                        }
                    );
                });
            }

            /**
             * Register the three dimensional Sensor-Simulators for the Test of IoT-Applications.
             */
            function registerThreeDimSensor(sensor) {
                deviceExists = false;
                adaptersExistsX = false;
                adaptersExistsY = false;
                adaptersExistsZ = false;
                if (sensor === "TestingBeschleunigungsSensor") {
                    sensorX = "TestingAccelerationX";
                    sensorY = "TestingAccelerationY";
                    sensorZ = "TestingAccelerationZ";
                    componentType = "Motion";
                } else if (sensor === "TestingBeschleunigungsSensorPl") {
                    sensorX = "TestingAccelerationPlX";
                    sensorY = "TestingAccelerationPlY";
                    sensorZ = "TestingAccelerationPlZ";
                    componentType = "Motion";
                } else if (sensor === "TestingGPSSensor") {
                    sensorX = "TestingGPSLatitude";
                    sensorY = "TestingGPSLongitude";
                    sensorZ = "TestingGPSHight";
                    componentType = "Location";
                } else if (sensor === "TestingGPSSensorPl") {
                    sensorX = "TestingGPSLatitudePl";
                    sensorY = "TestingGPSLongitudePl";
                    sensorZ = "TestingGPSHightPl";
                    componentType = "Location";
                }

                // Check if the required Adapters for the three dimensional sensor simulators exists
                $http.get(ENDPOINT_URI + '/adapters/search/findAll').success(function (response) {
                    angular.forEach(response._embedded.adapters, function (value) {
                        if (value.name === sensorX) {
                            adapterLinkX = value._links.self.href;
                            adaptersExistsX = true;
                        } else if (value.name === sensorY) {
                            adapterLinkY = value._links.self.href;
                            adaptersExistsY = true;
                        } else if (value.name === sensorZ) {
                            adapterLinkZ = value._links.self.href;
                            adaptersExistsZ = true;
                        }
                    });

                    // Check if the required Testing device for the sensor simulators exists
                    $http.get(ENDPOINT_URI + '/devices/search/findAll').success(function (response) {
                            angular.forEach(response._embedded.devices, function (value) {
                                if (value.name === "TestingDevice") {
                                    deviceLink = value._links.self.href;
                                    deviceExists = true;
                                }
                            });

                            // if the specific adapter for one dimension and the Testing device exists a server request for the registration is performed
                            if (deviceExists && adaptersExistsX) {

                                // Parameters for one of the sensor simulators of the three dimensional sensor registration
                                param = {
                                    "name": sensorX,
                                    "componentType": componentType,
                                    "adapter": adapterLinkX,
                                    "device": deviceLink,
                                    "errors": {}
                                };

                                // Server request for the registration for one sensor simulator of the three dimensional sensor
                                $http.post(ENDPOINT_URI + '/sensors/', param).then(function success(response) {
                                    checkSensorReg(sensor);

                                    //Notify the user if sensor is successfully registered
                                    NotificationService.notify('Entity successfully created.', 'success')
                                });
                            }

                            // if the specific adapter for one dimension and the Testing device exists a server request for the registration is performed
                            if (deviceExists && adaptersExistsY) {

                                // Parameters for one of the sensor simulators of the three dimesional sensor registration
                                param = {
                                    "name": sensorY,
                                    "componentType": componentType,
                                    "adapter": adapterLinkY,
                                    "device": deviceLink,
                                    "errors": {}
                                };

                                // Server request for the registration for one sensor simulator of the three dimensional sensor
                                $http.post(ENDPOINT_URI + '/sensors/', param).then(function success(response) {
                                    checkSensorReg(sensor);

                                    //Notify the user if sensor is successfully registered
                                    NotificationService.notify('Entity successfully created.', 'success')
                                });
                            }

                            // if the specific adapter for one dimension and the Testing device exists a server request for the registration is performed
                            if (deviceExists && adaptersExistsZ) {

                                // Parameters for one of the sensor simulators of the three dimensional sensor registration
                                param = {
                                    "name": sensorZ,
                                    "componentType": componentType,
                                    "adapter": adapterLinkZ,
                                    "device": deviceLink,
                                    "errors": {}
                                };

                                // Server request for the registration for one sensor simulator of the three dimensional sensor
                                $http.post(ENDPOINT_URI + '/sensors/', param).then(function success(response) {
                                    checkSensorReg(sensor);

                                    //Notify the user if sensor is successfully registered
                                    NotificationService.notify('Entity successfully created.', 'success')
                                });

                            } else if (!deviceExists && (adaptersExistsY || adaptersExistsX || adaptersExistsZ)) {
                                // Notify the user if the required Test device for the registration doesn't exist
                                NotificationService.notify("Please register the Testing device first.", "error");
                            } else if (deviceExists && (!adaptersExistsY || !adaptersExistsX || !adaptersExistsZ)) {
                                // Notify the user if one of the required Adapters for the registration doesn't exist
                                NotificationService.notify("Please register the corresponding adapters first.", "error");
                            } else if (!deviceExists && (!adaptersExistsY || !adaptersExistsX || !adaptersExistsZ)) {
                                // Notify the user if one of the required Adapters and Test device for the registration doesn't exist
                                NotificationService.notify("Please register the corresponding adapters and Testing device first.", "error");
                            }
                        }
                    );


                });

            }

            function downloadPDF(testID, endtimeUnix) {
                window.open('api/test-details/downloadPDF/' + testID + "_" + endtimeUnix, '_blank');
            }


            /**
             * [Public]
             * @param test
             * @returns {*}
             */
            $scope.detailsLink = function (test) {
                if (test.id) {
                    return "view/testing-tool/" + test.id;
                }
                return "#";
            };


            /**
             * [Public]
             * Shows an alert that asks the user if he is sure that he wants to delete a certain test.
             *
             * @param data A data object that contains the id of the test that is supposed to be deleted
             * @returns A promise of the user's decision
             */
            function confirmDelete(data) {

                const testId = data.id;
                let testName = "";

                //Determines the tests's name by checking the list
                for (let i = 0; i < testList.length; i++) {
                    if (testId === testList[i].id) {
                        testName = testList[i].name;
                        break;
                    }
                }

                //Show the alert to the user and return the resulting promise
                return Swal.fire({
                    title: 'Delete test',
                    type: 'warning',
                    html: "Are you sure you want to delete this test?",
                    showCancelButton: true,
                    confirmButtonText: 'Delete',
                    confirmButtonClass: 'bg-red',
                    focusConfirm: false,
                    cancelButtonText: 'Cancel'
                });
            }


            /**
             * Sends a server request in order to edit the configurations of the test "useNewData",
             * so that the latest values of a specific test are reused in the new execution or not
             *
             * @param testId
             * @param useNewData
             */
            function editConfig(testId, useNewData) {
                if (useNewData === true) {
                    $http.post(ENDPOINT_URI + '/test-details/editConfig/' + testId, "false").then(function success(response) {
                        $scope.erfolgreich = response.success;
                    });
                } else if (useNewData === false) {
                    $http.post(ENDPOINT_URI + '/test-details/editConfig/' + testId, "true").then(function success(response) {
                        $scope.erfolgreich = response.success;
                    });
                }
            }


            // expose controller ($controller will auto-add to $scope)
            angular.extend(vm, {


                testListCtrl: $controller('ItemListController as testListCtrl',
                    {
                        $scope: $scope,
                        list: testList
                    }),
                addTestCtrl: $controller('AddItemController as addTestCtrl',
                    {
                        $scope: $scope,
                        addItem: function (data) {
                            const newTestObject = {};
                            newTestObject.config = [];
                            try {
                                //Extend request parameters for routines and parameters
                                let parameters;
                                // random values Angle and Axis for the GPS-Sensor
                                const randomAngle = Math.floor((Math.random() * 361));
                                const randomAxis = Math.floor((Math.random() * 3));


                                // random values for the direction of the outlier and movement for the acceleration Sensor
                                const directionOutlier = Math.floor(Math.random() * 6);
                                const directionMovement = Math.floor(Math.random() * 6);

                                console.log(vm.selectedSensors);
                                console.log(vm.config.eventTemp);
                                if (vm.selectedSensors.includes('TestingTemperaturSensor')) {
                                    console.log("Hallo Temp");
                                    vm.parameterValues = [];
                                    vm.parameterValues.push({
                                        "name": "ConfigName",
                                        "value": 'TestingTemperaturSensor'
                                    });
                                    if (vm.config.eventTemp === '3' || vm.config.eventTemp === '4' || vm.config.eventTemp === '5' || vm.config.eventTemp === '6') {
                                       console.log("Event3");
                                        vm.parameterValues.push({
                                            "name": "event",
                                            "value": parseInt(vm.config.eventTemp)
                                        });
                                        vm.parameterValues.push({"name": "anomaly", "value": 0});
                                        vm.parameterValues.push({"name": "useNewData", "value": true});

                                    } else {
                                        vm.parameterValues.push({
                                            "name": "event",
                                            "value": parseInt(vm.config.eventTemp)
                                        });
                                        vm.parameterValues.push({"name": "useNewData", "value": true});
                                        vm.parameterValues.push({"name": "room", "value": vm.config.roomTemp});
                                        vm.parameterValues.push({
                                            "name": "anomaly",
                                            "value": parseInt(vm.config.anomalyTemp)
                                        });
                                    }
                                    console.log(vm.parameterValues);
                                    newTestObject.config.push(vm.parameterValues);
                                    console.log(newTestObject.config);


                                }

                                if (vm.selectedSensors.includes('TestingFeuchtigkeitsSensor')) {
                                    vm.parameterValues = [];
                                    vm.parameterValues.push({
                                        "name": "ConfigName",
                                        "value": 'TestingFeuchtigkeitsSensor'
                                    });
                                    if (vm.config.eventHum === '3' || vm.config.eventHum === '4' || vm.config.eventHum === '5' || vm.config.eventHum === '6') {

                                        vm.parameterValues.push({
                                            "name": "event",
                                            "value": parseInt(vm.config.eventHum)
                                        });
                                        vm.parameterValues.push({"name": "anomaly", "value": 0});
                                        vm.parameterValues.push({"name": "useNewData", "value": true});

                                    } else {
                                        vm.parameterValues.push({
                                            "name": "event",
                                            "value": parseInt(vm.config.eventHum)
                                        });
                                        vm.parameterValues.push({"name": "useNewData", "value": true});
                                        vm.parameterValues.push({"name": "room", "value": vm.config.roomHum});
                                        vm.parameterValues.push({
                                            "name": "anomaly",
                                            "value": parseInt(vm.config.anomalyHum)
                                        });
                                    }

                                    newTestObject.config.push(vm.parameterValues);
                                }

                                if (vm.selectedSensors.includes('TestingTemperaturSensorPl')) {
                                    vm.parameterValues = [];
                                    vm.parameterValues.push({
                                        "name": "ConfigName",
                                        "value": 'TestingTemperaturSensorPl'
                                    });
                                    if (vm.config.eventTempPl === '3' || vm.config.eventTempPl === '4' || vm.config.eventTempPl === '5' || vm.config.eventTempPl === '6') {
                                        vm.parameterValues.push({
                                            "name": "event",
                                            "value": parseInt(vm.config.eventTempPl)
                                        });
                                        vm.parameterValues.push({"name": "anomaly", "value": 0});
                                        vm.parameterValues.push({"name": "useNewData", "value": true});
                                        vm.parameterValues.push({"name": "simTime", "value": vm.config.simTime});
                                        vm.parameterValues.push({
                                            "name": "amountEvents",
                                            "value": vm.config.amountEvents
                                        });
                                        vm.parameterValues.push({
                                            "name": "amountAnomalies",
                                            "value": vm.config.amountAnomalies
                                        });
                                    } else {
                                        vm.parameterValues.push({
                                            "name": "event",
                                            "value": parseInt(vm.config.event)
                                        });
                                        vm.parameterValues.push({"name": "useNewData", "value": true});
                                        vm.parameterValues.push({"name": "simTime", "value": vm.config.simTime});
                                        vm.parameterValues.push({
                                            "name": "amountEvents",
                                            "value": vm.config.amountEvents
                                        });
                                        vm.parameterValues.push({
                                            "name": "amountAnomalies",
                                            "value": vm.config.amountAnomalies
                                        });
                                        vm.parameterValues.push({"name": "room", "value": vm.config.roomTempPl});
                                        vm.parameterValues.push({
                                            "name": "anomaly",
                                            "value": parseInt(vm.config.anomalyTempPl)
                                        });

                                    }
                                    newTestObject.config.push(vm.parameterValues);
                                }

                                if (vm.selectedSensors.includes('TestingFeuchtigkeitsSensorPl')) {
                                    vm.parameterValues = [];
                                    vm.parameterValues.push({
                                        "name": "ConfigName",
                                        "value": 'TestingFeuchtigkeitsSensorPl'
                                    });
                                    if (vm.config.eventHumPl === '3' || vm.config.eventHumPl === '4' || vm.config.eventHumPl === '5' || vm.config.eventHumPl === '6') {
                                        vm.parameterValues.push({
                                            "name": "event",
                                            "value": parseInt(vm.config.eventHumPl)
                                        });
                                        vm.parameterValues.push({"name": "anomaly", "value": 0});
                                        vm.parameterValues.push({"name": "useNewData", "value": true});
                                        vm.parameterValues.push({"name": "simTime", "value": vm.config.simTime});
                                        vm.parameterValues.push({
                                            "name": "amountEvents",
                                            "value": vm.config.amountEvents
                                        });
                                        vm.parameterValues.push({
                                            "name": "amountAnomalies",
                                            "value": vm.config.amountAnomalies
                                        });
                                    } else {
                                        vm.parameterValues.push({
                                            "name": "event",
                                            "value": parseInt(vm.config.eventHumPl)
                                        });
                                        vm.parameterValues.push({"name": "useNewData", "value": true});
                                        vm.parameterValues.push({"name": "simTime", "value": vm.config.simTime});
                                        vm.parameterValues.push({
                                            "name": "amountEvents",
                                            "value": vm.config.amountEvents
                                        });
                                        vm.parameterValues.push({
                                            "name": "amountAnomalies",
                                            "value": vm.config.amountAnomalies
                                        });
                                        vm.parameterValues.push({"name": "room", "value": vm.config.roomHumPl});
                                        vm.parameterValues.push({
                                            "name": "anomaly",
                                            "value": parseInt(vm.config.anomalyHumPl)
                                        });

                                    }
                                    newTestObject.config.push(vm.parameterValues);
                                }

                                if (vm.selectedSensors.includes('TestingGPSSensor')) {
                                    vm.parameterValues = [];
                                    vm.parameterValues.push({
                                        "name": "ConfigName",
                                        "value": 'TestingGPSSensor'
                                    });
                                    if (vm.config.eventGPS === '3' || vm.config.eventGPS === '4' || vm.config.eventGPS === '5') {
                                        vm.parameterValues.push({"name": "who", "value": vm.config.whoGPS});
                                        vm.parameterValues.push({
                                            "name": "event",
                                            "value": parseInt(vm.config.eventGPS)
                                        });
                                        vm.parameterValues.push({"name": "anomaly", "value": 0});
                                        vm.parameterValues.push({"name": "useNewData", "value": true});
                                        vm.parameterValues.push({
                                            "name": "latitude",
                                            "value": vm.config.latitudeGPS
                                        });
                                        vm.parameterValues.push({
                                            "name": "longitude",
                                            "value": vm.config.longitudeGPS
                                        });
                                        vm.parameterValues.push({"name": "hight", "value": vm.config.hightGPS});
                                        vm.parameterValues.push({
                                            "name": "reactionMeters",
                                            "value": vm.config.reactionMetersGPS
                                        });
                                        vm.parameterValues.push({"name": "randomAngle", "value": randomAngle});
                                        vm.parameterValues.push({"name": "axis", "value": randomAxis});
                                    } else {
                                        vm.parameterValues.push({"name": "who", "value": vm.config.whoGPS});
                                        vm.parameterValues.push({
                                            "name": "event",
                                            "value": parseInt(vm.config.eventGPS)
                                        });
                                        vm.parameterValues.push({"name": "useNewData", "value": true});
                                        vm.parameterValues.push({
                                            "name": "latitude",
                                            "value": vm.config.latitudeGPS
                                        });
                                        vm.parameterValues.push({
                                            "name": "longitude",
                                            "value": vm.config.longitudeGPS
                                        });
                                        vm.parameterValues.push({"name": "hight", "value": vm.config.hightGPS});
                                        vm.parameterValues.push({
                                            "name": "reactionMeters",
                                            "value": vm.config.reactionMetersGPS
                                        });
                                        vm.parameterValues.push({"name": "randomAngle", "value": randomAngle});
                                        vm.parameterValues.push({"name": "axis", "value": randomAxis});
                                        vm.parameterValues.push({
                                            "name": "anomaly",
                                            "value": parseInt(vm.config.anomalyGPS)
                                        });
                                    }

                                    newTestObject.config.push(vm.parameterValues);
                                }
                                if (vm.selectedSensors.includes('TestingGPSSensorPl')) {
                                    vm.parameterValues = [];
                                    vm.parameterValues.push({
                                        "name": "ConfigName",
                                        "value": 'TestingGPSSensorPl'
                                    });
                                    if (vm.config.eventGPSPl === '3' || vm.config.eventGPSPl === '4' || vm.config.eventGPSPl === '5') {

                                        vm.parameterValues.push({"name": "who", "value": vm.config.whoGPSPl});
                                        vm.parameterValues.push({
                                            "name": "event",
                                            "value": parseInt(vm.config.eventGPSPl)
                                        });
                                        vm.parameterValues.push({"name": "anomaly", "value": 0});
                                        vm.parameterValues.push({"name": "useNewData", "value": true});
                                        vm.parameterValues.push({
                                            "name": "latitude",
                                            "value": vm.config.latitudeGPSPl
                                        });
                                        vm.parameterValues.push({
                                            "name": "longitude",
                                            "value": vm.config.longitudeGPSPl
                                        });
                                        vm.parameterValues.push({"name": "hight", "value": vm.config.hightGPSPl});
                                        vm.parameterValues.push({
                                            "name": "reactionMeters",
                                            "value": vm.config.reactionMetersGPSPl
                                        });
                                        vm.parameterValues.push({"name": "randomAngle", "value": randomAngle});
                                        vm.parameterValues.push({"name": "axis", "value": randomAxis});
                                        vm.parameterValues.push({"name": "simTime", "value": vm.config.simTime});
                                        vm.parameterValues.push({
                                            "name": "amountEvents",
                                            "value": vm.config.amountEvents
                                        });
                                        vm.parameterValues.push({
                                            "name": "amountAnomalies",
                                            "value": vm.config.amountAnomalies
                                        });
                                    } else {
                                        vm.parameterValues.push({"name": "who", "value": vm.config.whoGPSPl});
                                        vm.parameterValues.push({
                                            "name": "event",
                                            "value": parseInt(vm.config.eventGPSPl)
                                        });
                                        vm.parameterValues.push({"name": "useNewData", "value": true});
                                        vm.parameterValues.push({
                                            "name": "latitude",
                                            "value": vm.config.latitudeGPSPl
                                        });
                                        vm.parameterValues.push({
                                            "name": "longitude",
                                            "value": vm.config.longitudeGPSPl
                                        });
                                        vm.parameterValues.push({"name": "hight", "value": vm.config.hightGPSPl});
                                        vm.parameterValues.push({
                                            "name": "reactionMeters",
                                            "value": vm.config.reactionMetersGPSPl
                                        });
                                        vm.parameterValues.push({"name": "randomAngle", "value": randomAngle});
                                        vm.parameterValues.push({"name": "axis", "value": randomAxis});
                                        vm.parameterValues.push({
                                            "name": "anomaly",
                                            "value": parseInt(vm.config.anomalyGPSPl)
                                        });
                                        vm.parameterValues.push({"name": "simTime", "value": vm.config.simTime});
                                        vm.parameterValues.push({
                                            "name": "amountEvents",
                                            "value": vm.config.amountEvents
                                        });
                                        vm.parameterValues.push({
                                            "name": "amountAnomalies",
                                            "value": vm.config.amountAnomalies
                                        });
                                    }

                                    newTestObject.config.push(vm.parameterValues);
                                }
                                if (vm.selectedSensors.includes('TestingBeschleunigungsSensor')) {
                                    vm.parameterValues = [];
                                    vm.parameterValues.push({
                                        "name": "ConfigName",
                                        "value": 'TestingBeschleunigungsSensor'
                                    });
                                    if (vm.config.eventAcc === '3' || vm.config.eventAcc === '4' || vm.config.eventAcc === '5') {
                                        vm.parameterValues.push({
                                            "name": "event",
                                            "value": parseInt(vm.config.eventAcc)
                                        });
                                        vm.parameterValues.push({"name": "useNewData", "value": true});
                                        vm.parameterValues.push({
                                            "name": "directionAnomaly",
                                            "value": directionOutlier
                                        });
                                        vm.parameterValues.push({
                                            "name": "directionMovement",
                                            "value": directionMovement
                                        });

                                        vm.parameterValues.push({"name": "anomaly", "value": 0});
                                        vm.parameterValues.push({"name": "weightObject", "value": 0});
                                        vm.parameterValues.push({"name": "sensitivityClass", "value": 0});
                                        vm.parameterValues.push({"name": "reactionMeters", "value": 3});
                                    } else if (vm.config.event === '2') {
                                        vm.parameterValues.push({
                                            "name": "event",
                                            "value": parseInt(vm.config.eventAcc)
                                        });
                                        vm.parameterValues.push({
                                            "name": "anomaly",
                                            "value": parseInt(vm.config.anomalyAcc)
                                        });
                                        vm.parameterValues.push({"name": "useNewData", "value": true});
                                        vm.parameterValues.push({
                                            "name": "weightObject",
                                            "value": parseInt(vm.config.weightObjectAcc)
                                        });
                                        vm.parameterValues.push({
                                            "name": "sensitivityClass",
                                            "value": parseInt(vm.config.sensitivityAcc)
                                        });
                                        vm.parameterValues.push({
                                            "name": "reactionMeters",
                                            "value": parseInt(vm.config.reactionMetersAcc)
                                        });
                                        vm.parameterValues.push({
                                            "name": "directionAnomaly",
                                            "value": directionOutlier
                                        });
                                        vm.parameterValues.push({
                                            "name": "directionMovement",
                                            "value": directionMovement
                                        });
                                    } else if (vm.config.event === '1') {
                                        vm.parameterValues.push({
                                            "name": "event",
                                            "value": parseInt(vm.config.eventAcc)
                                        });
                                        vm.parameterValues.push({
                                            "name": "anomaly",
                                            "value": parseInt(vm.config.anomalyAcc)
                                        });
                                        vm.parameterValues.push({"name": "useNewData", "value": true});
                                        vm.parameterValues.push({
                                            "name": "directionAnomaly",
                                            "value": directionOutlier
                                        });
                                        vm.parameterValues.push({
                                            "name": "directionMovement",
                                            "value": directionMovement
                                        });

                                        vm.parameterValues.push({"name": "weightObject", "value": 0});
                                        vm.parameterValues.push({"name": "sensitivityClass", "value": 0});
                                        vm.parameterValues.push({"name": "reactionMeters", "value": 3});
                                    }
                                    newTestObject.config.push(vm.parameterValues);
                                }

                                if (vm.selectedSensors.includes('TestingBeschleunigungsSensorPl')) {
                                    vm.parameterValues = [];
                                    vm.parameterValues.push({
                                        "name": "ConfigName",
                                        "value": 'TestingBeschleunigungsSensorPl'
                                    });
                                    if (vm.config.eventAccPl === '3' || vm.config.eventAccPl === '4' || vm.config.eventAccPl === '5') {
                                        vm.parameterValues.push({
                                            "name": "event",
                                            "value": parseInt(vm.config.eventAccPl)
                                        });
                                        vm.parameterValues.push({"name": "useNewData", "value": true});
                                        vm.parameterValues.push({
                                            "name": "directionAnomaly",
                                            "value": directionOutlier
                                        });
                                        vm.parameterValues.push({
                                            "name": "directionMovement",
                                            "value": directionMovement
                                        });

                                        vm.parameterValues.push({"name": "anomaly", "value": 0});
                                        vm.parameterValues.push({"name": "weightObject", "value": 0});
                                        vm.parameterValues.push({"name": "sensitivityClass", "value": 0});
                                        vm.parameterValues.push({"name": "reactionMeters", "value": 3});
                                        vm.parameterValues.push({"name": "simTime", "value": vm.config.simTime});
                                        vm.parameterValues.push({
                                            "name": "amountEvents",
                                            "value": vm.config.amountEvents
                                        });
                                        vm.parameterValues.push({
                                            "name": "amountAnomalies",
                                            "value": vm.config.amountAnomalies
                                        });
                                    } else if (vm.config.event === '2') {
                                        vm.parameterValues.push({
                                            "name": "event",
                                            "value": parseInt(vm.config.eventAccPl)
                                        });
                                        vm.parameterValues.push({
                                            "name": "anomaly",
                                            "value": parseInt(vm.config.anomalyAccPl)
                                        });
                                        vm.parameterValues.push({"name": "useNewData", "value": true});
                                        vm.parameterValues.push({
                                            "name": "weightObject",
                                            "value": parseInt(vm.config.weightObjectAccPl)
                                        });
                                        vm.parameterValues.push({
                                            "name": "sensitivityClass",
                                            "value": parseInt(vm.config.sensitivityAccPl)
                                        });
                                        vm.parameterValues.push({
                                            "name": "reactionMeters",
                                            "value": parseInt(vm.config.reactionMetersAccPl)
                                        });
                                        vm.parameterValues.push({
                                            "name": "directionAnomaly",
                                            "value": directionOutlier
                                        });
                                        vm.parameterValues.push({
                                            "name": "directionMovement",
                                            "value": directionMovement
                                        });
                                        vm.parameterValues.push({"name": "simTime", "value": vm.config.simTime});
                                        vm.parameterValues.push({
                                            "name": "amountEvents",
                                            "value": vm.config.amountEvents
                                        });
                                        vm.parameterValues.push({
                                            "name": "amountAnomalies",
                                            "value": vm.config.amountAnomalies
                                        });
                                    } else if (vm.config.event === '1') {
                                        vm.parameterValues.push({
                                            "name": "event",
                                            "value": parseInt(vm.config.eventAccPl)
                                        });
                                        vm.parameterValues.push({
                                            "name": "anomaly",
                                            "value": parseInt(vm.config.anomalyAccPl)
                                        });
                                        vm.parameterValues.push({"name": "useNewData", "value": true});
                                        vm.parameterValues.push({
                                            "name": "directionAnomaly",
                                            "value": directionOutlier
                                        });
                                        vm.parameterValues.push({
                                            "name": "directionMovement",
                                            "value": directionMovement
                                        });

                                        vm.parameterValues.push({"name": "weightObject", "value": 0});
                                        vm.parameterValues.push({"name": "sensitivityClass", "value": 0});
                                        vm.parameterValues.push({"name": "reactionMeters", "value": 3});
                                        vm.parameterValues.push({"name": "simTime", "value": vm.config.simTime});
                                        vm.parameterValues.push({
                                            "name": "amountEvents",
                                            "value": vm.config.amountEvents
                                        });
                                        vm.parameterValues.push({
                                            "name": "amountAnomalies",
                                            "value": vm.config.amountAnomalies
                                        });
                                    }
                                    newTestObject.config.push(vm.parameterValues);
                                }


                                for (let property in data) {
                                    if (data.hasOwnProperty(property)) {
                                        newTestObject[property] = data[property];
                                    }
                                }


                                newTestObject.type = vm.selectedSensors;


                                console.log(newTestObject);
                            } catch (e) {
                                vm.parameterValues = [];
                                newTestObject.type = "";
                                vm.parameterValues.push({
                                    "name": "ConfigName",
                                    "value": 'ERROR'
                                });
                                vm.parameterValues.push({
                                    "name": "event",
                                    "value": parseInt(0)
                                });
                                vm.parameterValues.push({"name": "anomaly", "value": 0});
                                vm.parameterValues.push({"name": "useNewData", "value": true});
                                newTestObject.config.push(vm.parameterValues);
                                console.log(newTestObject);

                                console.log("catched error")
                            }


                            newTestObject.rules = vm.rules;
                            const radios = document.getElementsByName('executeRules');
                            let i = 0;
                            const length = radios.length;
                            for (; i < length; i++) {
                                if (radios[i].checked) {
                                    var executeRulesTemp = radios[i].value;
                                    break;
                                }
                            }

                            if (executeRulesTemp === 'undefined') {
                                NotificationService.notify('A decision must be made.', 'error')
                            }

                            vm.executeRules = executeRulesTemp === 'true';
                            newTestObject.triggerRules = vm.executeRules;

                            return addTest(newTestObject);

                        }
                    }),
                deleteTestCtrl: $controller('DeleteTestController as deleteTestCtrl', {
                    $scope: $scope,
                    deleteItem: deleteTest,
                    confirmDeletion: confirmDelete
                }),
                executeTest: executeTest,
                editConfig: editConfig,
                stopTest: stopTest,
                downloadPDF: downloadPDF,
                refreshTestEntry: refreshTestEntry,
                getDevice: getDevice,
                registerTestDevice: registerTestDevice,
                checkSensorReg: checkSensorReg,
                registerOneDimSensor: registerOneDimSensor,
                registerThreeDimSensor: registerThreeDimSensor,
                checkActuatorReg: checkActuatorReg,
                registerTestingActuator: registerTestingActuator

            });
            // $watch 'addTest' result and add to 'testList'
            $scope.$watch(
                function () {
                    //Value being watched
                    return vm.addTestCtrl.result;
                },
                function () {
                    //Callback
                    const test = vm.addTestCtrl.result;

                    if (test) {
                        //Close modal on success
                        $("#addTestingModal").modal('toggle');
                        //Add sensor to sensor list
                        vm.testListCtrl.pushItem(test);

                    }
                }
            );


            //Watch deletion of tests and remove them from the list
            $scope.$watch(
                function () {
                    //Value being watched
                    return vm.deleteTestCtrl.result;
                },
                function () {
                    //Callback
                    const id = vm.deleteTestCtrl.result;
                    vm.testListCtrl.removeItem(id);
                }
            );

        }
    ]);
