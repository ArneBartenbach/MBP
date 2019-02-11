/* global app */

app.controller('ActuatorListController',
  ['$scope', '$controller', 'actuatorList', 'addActuator', 'deleteActuator',
    'deviceList', 'addDevice', 'deleteDevice', 'adapterList', 'ComponentTypeService',
    function($scope, $controller, actuatorList, addActuator, deleteActuator,
      deviceList, addDevice, deleteDevice, adapterList, ComponentTypeService) {
      var vm = this;

      (function initController() {
        loadActuatorTypes();
      })();

      // public
      $scope.detailsLink = function(actuator) {
        if (actuator.id) {
          return "view/actuators/" + actuator.id;
        }
        return "#";
      };

      function confirmDelete(data) {
        var actuatorId = data.id;
        var actuatorName = "";

        for(var i = 0; i < actuatorList.length; i++){
          if(actuatorId == actuatorList[i].id){
            actuatorName = actuatorList[i].name;
            break;
          }
        }

        return Swal.fire({
          title: 'Delete actuator',
          type: 'warning',
          html: "Are you sure you want to delete actuator \"" + actuatorName + "\"?",
          showCancelButton: true,
          confirmButtonText: 'Delete',
          cancelButtonText: 'Cancel'
        });
      }

      // expose variables
      angular.extend(vm, {
        registeringDevice: false
      });

      // expose controller ($controller will auto-add to $scope)
      angular.extend(vm, {
        actuatorListCtrl: $controller('ItemListController as actuatorListCtrl', {
          $scope: $scope,
          list: actuatorList
        }),
        addActuatorCtrl: $controller('AddItemController as addActuatorCtrl', {
          $scope: $scope,
          addItem: addActuator
        }),
        deleteActuatorCtrl: $controller('DeleteItemController as deleteActuatorCtrl', {
          $scope: $scope,
          deleteItem: deleteActuator,
          confirmDeletion: confirmDelete
        }),
        deviceCtrl: $controller('DeviceListController as deviceCtrl', {
          $scope: $scope,
          deviceList: deviceList,
          addDevice: addDevice,
          deleteDevice: deleteDevice
        }),
        adapterListCtrl: $controller('ItemListController as adapterListCtrl', {
          $scope: $scope,
          list: adapterList
        })
      });

      // $watch 'addActuator' result and add to 'actuatorList'
      $scope.$watch(
        function() {
          // value being watched
          return vm.addActuatorCtrl.result;
        },
        function() {
          // callback
          console.log('addActuatorCtrl.result modified.');

          var data = vm.addActuatorCtrl.result;
          if (data) {
            vm.actuatorListCtrl.pushItem(vm.addActuatorCtrl.result);
          }
        }
      );

      // $watch 'deleteItem' result and remove from 'itemList'
      $scope.$watch(
        function() {
          // value being watched
          return vm.deleteActuatorCtrl.result;
        },
        function() {
          var id = vm.deleteActuatorCtrl.result;

          vm.actuatorListCtrl.removeItem(id);
        }
      );

      // $watch 'addDevice' result and select on actuator form
      $scope.$watch(
        function() {
          // value being watched
          return $scope.addDeviceCtrl.result;
        },
        function() {
          // callback
          console.log('addDeviceCtrl.result modified.');

          var data = $scope.addDeviceCtrl.result;
          if (data) {
            $scope.addActuatorCtrl.item.device = data._links.self.href;
            vm.registeringDevice = false;
          }
        }
      );

      function loadActuatorTypes() {
        ComponentTypeService.GetByComponent('ACTUATOR')
          .then(function(response) {
            if (response.success) {
              vm.actuatorTypes = response.data;
            } else {
              console.log("Error loading actuator types!");
            }
          });
      };

    }
  ]);