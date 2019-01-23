(function() {
  'use strict';

  angular
    .module('app')
    .factory('ModelService', ModelService);

  ModelService.$inject = ['$http', 'ENDPOINT_URI', 'BASE_URI'];

  function ModelService($http, ENDPOINT_URI, BASE_URI) {
    var service = {};

    service.SaveModel = SaveModel;
    service.GetModelsByUsername = GetModelsByUsername;
    service.DeleteModel = DeleteModel;

    return service;

    function SaveModel(model) {
      return $http.post(ENDPOINT_URI + '/model', model);
    }

    function GetModelsByUsername() {
      return $http.get(ENDPOINT_URI + '/models');
    }

    function DeleteModel(name) {
      return $http.delete(ENDPOINT_URI + '/models/' + name);
    }

    // private functions

    // function handleSuccess(res) {
    //   return {
    //     success: true,
    //     message: res.headers('X-MBP-alert'),
    //     data: res.data
    //   };
    // }
    //
    // function handleError(res) {
    //   return {
    //     success: false,
    //     message: res.headers('X-MBP-error'),
    //     status: res.status
    //   };
    // }

  }

})();