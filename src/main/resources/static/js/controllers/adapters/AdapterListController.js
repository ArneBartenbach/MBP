/* global app */

app.controller('AdapterListController',
        ['$scope', '$controller', '$q', 'adapterList', 'addAdapter', 'deleteAdapter', 'FileReader', 'ParameterTypeService', 'AdapterService',
            function ($scope, $controller, $q, adapterList, addAdapter, deleteAdapter, FileReader, ParameterTypeService, AdapterService) {
                var vm = this;

                vm.dzServiceOptions = {
                    paramName: 'serviceFile',
                    maxFilesize: '100',
                    maxFiles: 1
                };

                vm.dzServiceCallbacks = {
                    'addedfile': function (file) {
                        console.log(file);
                        vm.addAdapterCtrl.item.serviceFile = file;
                    }
                };

                vm.dzRoutinesOptions = {
                    paramName: 'routinesFile',
                    maxFilesize: '100',
                    maxFiles: 99
                };

                vm.dzRoutinesCallbacks = {
                    'addedfile': function (file) {
                        if (!vm.addAdapterCtrl.item.routineFiles) {
                            vm.addAdapterCtrl.item.routineFiles = [];
                        }
                        vm.addAdapterCtrl.item.routineFiles.push(file);
                    }
                };

                vm.dzMethods = {};

                vm.parameterTypes = [];

                vm.parameters = [];

                //public
                function addDeploymentParameter(){
                    var parameter = {
                        name: "",
                        type: "",
                        unit: "",
                        mandatory: false
                    };
                    vm.parameters.push(parameter);
                }

                //public
                function deleteDeploymentParameter(index){
                    vm.parameters.splice(index, 1);
                }

                //private
                function readService(service) {
                    if (service) {
                        return FileReader.readAsText(service, $scope);
                    } else {
                        // reject
                        return '';
                    	//return $q.reject('Service file must not be empty.');
                    }
                }

                //private
                function readRoutines(routines) {
                    if ((routines !== undefined) && (routines.constructor === Array)) {
                        //Read routines files
                        return FileReader.readMultipleAsDataURL(routines, $scope);
                    } else {
                        //Return empty promise (no routine files)
                        return $q.all([]);
                    }
                }

                //private
                function loadParameterTypes() {
                    ParameterTypeService.getAll().then(function(response) {
                        if (response.success) {
                            vm.parameterTypes = response.data;
                        } else {
                            console.log("Error while loading parameter types.");
                        }
                    });
                }

                function confirmDelete(data) {
                    var usingComponents = AdapterService.getUsingComponents(data.id);
                    console.log(usingComponents);

                    var adapterId = data.id;
                    var adapterName = "";

                    for(var i = 0; i < adapterList.length; i++){
                        if(adapterId == adapterList[i].id){
                            adapterName = adapterList[i].name;
                            break;
                        }
                    }

                    return swal("Delete adapter",
                        "Are you sure you want to delete adapter \"" + adapterName + "\"?", "warning",
                        {
                            buttons: ["Cancel", "Delete adapter"]
                        });
                }

                // expose controller ($controller will auto-add to $scope)
                angular.extend(vm, {
                    addDeploymentParameter: addDeploymentParameter,
                    deleteDeploymentParameter : deleteDeploymentParameter,
                    adapterListCtrl: $controller('ItemListController as adapterListCtrl',
                            {
                                $scope: $scope,
                                list: adapterList
                            }),
                    addAdapterCtrl: $controller('AddItemController as addAdapterCtrl',
                            {
                                $scope: $scope,
                                addItem: function (data) {
                                    //Extend request parameters for routines and deployment parameters
                                    return readRoutines(data.routineFiles)
                                    .then(function (response) {
                                        data.routines = response;
                                        data.parameters = vm.parameters;
                                        return addAdapter(data);
                                    }, function (response) {
                                        return $q.reject(response);
                                    });

//                                    return readService(data.serviceFile).then(
//                                            function (response) {
//                                                console.log('readService: ', response);
//                                                data.service = response;
//                                                return readRoutines(data.routineFiles)
//                                                        .then(function (response) {
//                                                            console.log('readRoutines: ', response);
//                                                            data.routines = response;
//                                                            return addAdapter(data);
//                                                        }, function (response) {
//                                                            return $q.reject(response);
//                                                        });
//                                            }, function (response) {
//                                        return $q.reject(response);
//                                    });
                                }
                            }),
                    deleteAdapterCtrl: $controller('DeleteItemController as deleteAdapterCtrl',
                            {
                                $scope: $scope,
                                deleteItem: deleteAdapter,
                                confirmDeletion: confirmDelete
                            }),
                });

                // $watch 'addItem' result and add to 'itemList'
                $scope.$watch(
                        function () {
                            // value being watched
                            return vm.addAdapterCtrl.result;
                        },
                        function () {
                            // callback
                            console.log('addAdapterCtrl.result modified.');

                            var data = vm.addAdapterCtrl.result;
                            if (data) {
                                console.log('pushItem.');
                                vm.adapterListCtrl.pushItem(data);
                            }
                        }
                );

                // $watch 'deleteItem' result and remove from 'itemList'
                $scope.$watch(
                        function () {
                            // value being watched
                            return vm.deleteAdapterCtrl.result;
                        },
                        function() {
                          var id = vm.deleteAdapterCtrl.result;

                          vm.adapterListCtrl.removeItem(id);
                        }
                );

                //Load parameter types for select
                loadParameterTypes();
            }]);