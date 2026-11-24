const db = require("../../src/database/connection")
const equipmentService = require("../../src/services/equipment.service")
const { resetDatabase, createUser, createEquipment } = require('./helpers/db');

describe('Equipment Service Integration Tests', () => {

      beforeEach(async () => {
        await resetDatabase();
      });
    
      afterEach(() => {
        jest.restoreAllMocks();
      });
    
      afterAll(async () => {
        await resetDatabase();
        await db.pool.end();
      });

      it('Returns an error when finding by ID and no equipment is found', async() => {
        await expect(equipmentService.get(1)
        ).rejects.toMatchObject({ statusCode: 404, message: 'Equipment not found.' });
      });

      it('Returns an error when deleting by ID and no equipment is found', async() => {
        await expect(equipmentService.remove(1)
        ).rejects.toMatchObject({ statusCode: 404, message: 'Equipment not found.' });
      });

      it('Returns an error when attempting to update equipment that does not exist', async() => {
        const user = await createUser();
        await expect(equipmentService.setStatus(1, 'available', user.id, 'status test')
        ).rejects.toMatchObject({ statusCode: 404, message: 'Equipment not found.' });
      });

      it('Returns an error when attempting to update equipment with an invalid status', async() => {
        const user = await createUser();
        const equipment = await createEquipment();
        const equipment2 = await createEquipment({ status: 'out_of_service' });
        await expect(equipmentService.setStatus(equipment.id, 'unavailable', user.id, 'status test')
        ).rejects.toMatchObject({ statusCode: 400, message: 'Invalid status transition: available -> unavailable.' });
        await expect(equipmentService.setStatus(equipment2.id, 'booked', user.id, 'status test')
        ).rejects.toMatchObject({ statusCode: 400, message: 'Invalid status transition: out_of_service -> booked.' });
      });

});