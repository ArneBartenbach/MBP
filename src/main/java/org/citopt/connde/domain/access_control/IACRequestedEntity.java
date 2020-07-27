package org.citopt.connde.domain.access_control;

import java.util.List;

import org.citopt.connde.domain.user.User;

/**
 * A requested entity within the MBP access-control framework,
 * e.g., a sensor or an actuator.
 * 
 * @author Jakob Benz
 */
public interface IACRequestedEntity extends IACEntity {
	
	/* (non-Javadoc)
	 * @see org.citopt.connde.domain.access_control.IACEntity#getType()
	 */
	@Override
	public default ACEntityType getEntityType() {
		return ACEntityType.REQUESTED_ENTITY;
	}
	
	/**
	 * Returns the owner of this entity.
	 * 
	 * @return the {@link User owner} of this entity.
	 */
	public User getOwner();
	
	/**
	 * Returns the list of policies used to
	 * check whether access to this entity should be granted
	 * or not.
	 * 
	 * @return the list of {@link ACPolicy policies}.
	 */
	public List<ACPolicy<?>> getAccessControlPolicies();
	
}
