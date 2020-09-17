package org.citopt.connde.web.rest;

import static org.springframework.hateoas.server.mvc.WebMvcLinkBuilder.linkTo;
import static org.springframework.hateoas.server.mvc.WebMvcLinkBuilder.methodOn;

import java.util.List;

import javax.validation.Valid;

import org.citopt.connde.RestConfiguration;
import org.citopt.connde.domain.access_control.ACAccessRequest;
import org.citopt.connde.domain.access_control.ACAccessType;
import org.citopt.connde.domain.component.Sensor;
import org.citopt.connde.repository.SensorRepository;
import org.citopt.connde.service.UserEntityService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Pageable;
import org.springframework.hateoas.EntityModel;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.PagedModel;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import io.swagger.annotations.ApiParam;
import io.swagger.annotations.ApiResponse;
import io.swagger.annotations.ApiResponses;

/**
 * REST Controller for managing {@link Sensor}s.
 * 
 * @author Jakob Benz
 */
@RestController
@RequestMapping(RestConfiguration.BASE_PATH + "/sensors")
@Api(tags = { "Sensors" })
public class RestSensorController {
	
    @Autowired
    private SensorRepository sensorRepository;
    
    @Autowired
    private UserEntityService userEntityService;
    
    
	@GetMapping(consumes = MediaType.APPLICATION_JSON_VALUE, produces = "application/hal+json")
	@ApiOperation(value = "Retrieves all existing sensor entities available for the requesting entity.", produces = "application/hal+json")
	@ApiResponses({ @ApiResponse(code = 200, message = "Success!"),
			@ApiResponse(code = 404, message = "Sensor or requesting user not found!") })
    public ResponseEntity<PagedModel<EntityModel<Sensor>>> all(
    		@ApiParam(value = "Page parameters", required = true) Pageable pageable,
    		@Valid @RequestBody ACAccessRequest<?> accessRequest) {
    	// Retrieve the corresponding sensors (includes access-control)
    	List<Sensor> sensors = userEntityService.getPageWithPolicyCheck(sensorRepository, ACAccessType.READ, accessRequest, pageable);
    	
    	// Create self link
    	Link selfLink = linkTo(methodOn(getClass()).all(pageable, accessRequest)).withSelfRel();
    	
    	return ResponseEntity.ok(userEntityService.entitiesToPagedModel(sensors, selfLink, pageable));
    }
    
    @GetMapping(path = "/{sensorId}", consumes = MediaType.APPLICATION_JSON_VALUE, produces = "application/hal+json")
    @ApiOperation(value = "Retrieves an existing sensor entity identified by its id if it's available for the requesting entity.", produces = "application/hal+json")
    @ApiResponses({ @ApiResponse(code = 200, message = "Success!"),
    		@ApiResponse(code = 401, message = "Not authorized to access the sensor!"),
    		@ApiResponse(code = 404, message = "Sensor or requesting user not found!") })
    public ResponseEntity<EntityModel<Sensor>> one(
    		@PathVariable("sensorId") String sensorId,
    		@ApiParam(value = "Page parameters", required = true) Pageable pageable,
    		@Valid @RequestBody ACAccessRequest<?> accessRequest) {
    	// Retrieve the corresponding sensor (includes access-control)
    	Sensor sensor = userEntityService.getForIdWithPolicyCheck(sensorRepository, sensorId, ACAccessType.READ, accessRequest);
    	return ResponseEntity.ok(userEntityService.entityToEntityModel(sensor));
    }
    
    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE, produces = "application/hal+json")
    @ApiOperation(value = "Retrieves an existing sensor entity identified by its id if it's available for the requesting entity.", produces = "application/hal+json")
    @ApiResponses({ @ApiResponse(code = 200, message = "Success!"),
    		@ApiResponse(code = 409, message = "Sensor already exists!") })
    public ResponseEntity<EntityModel<Sensor>> create(@PathVariable("sensorId") String sensorId, @ApiParam(value = "Page parameters", required = true) Pageable pageable, @RequestBody Sensor sensor) {
    	// Check whether a sensor with the same name already exists in the database
    	userEntityService.requireUniqueName(sensorRepository, sensor.getName());

    	// Save sensor in the database
    	Sensor createdSensor = sensorRepository.save(sensor);
    	return ResponseEntity.ok(userEntityService.entityToEntityModel(createdSensor));
    }
    
    @DeleteMapping(path = "/{sensorId}")
    @ApiOperation(value = "Deletes an existing sensor entity identified by its id if it's available for the requesting entity.")
    @ApiResponses({ @ApiResponse(code = 204, message = "Success!"),
    		@ApiResponse(code = 401, message = "Not authorized to delete the sensor!"),
    		@ApiResponse(code = 404, message = "Sensor or requesting user not found!") })
    public ResponseEntity<Void> delete(@PathVariable("sensorId") String sensorId, @Valid @RequestBody ACAccessRequest<?> accessRequest) {
    	// Delete the sensor (includes access-control) 
    	userEntityService.deleteWithPolicyCheck(sensorRepository, sensorId, accessRequest);
    	return ResponseEntity.noContent().build();
    }
    
}
