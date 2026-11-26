const db = require("../../src/database/connection");
const equipmentRepo = require("../../src/repositories/equipment.repository");
const equipmentData = require("./helpers/models/equipments");

describe("Equipment Repository Integration Tests", ()=>{

    beforeEach(async () => {
        client = await db.pool.connect();
        await client.query('BEGIN');
    });
    
    afterEach(async () => {
        try {
          await client.query('ROLLBACK');
        } finally {
          client.release();
        }
    });
    
    afterAll(async () => {
        await db.pool.end();
    });

    it("Checks that the equipment is correctly created", async ()=> {
        const e1 = equipmentData.equipment1;
        const equipment = await equipmentRepo.create(e1, client);
        expect(equipment).toBeDefined();
        expect(equipment.name).toBe(e1.name);
        expect(equipment.description).toBe(e1.description);
    })

    it("Checks that the correct equipment is displayed when searching by ID", async ()=> {
        const e1 = equipmentData.equipment1;
        const equipment1 = await equipmentRepo.create(e1, client);
        const equipment = await equipmentRepo.findById(equipment1.id, client);
        expect(equipment).toBeDefined();
        expect(equipment.id).toBe(equipment1.id);
        expect(equipment.name).toBe(equipment1.name);
        expect(equipment.description).toBe(equipment1.description);
    })

    it("Checks that the list of equipment is displayed, without filters applied", async ()=> {
        const e1 = equipmentData.equipment1;
        const e2 = equipmentData.equipment2;
        const e3 = equipmentData.equipment3;
        await equipmentRepo.create(e1, client);
        await equipmentRepo.create(e2, client);
        await equipmentRepo.create(e3, client);
        const equipment = await equipmentRepo.list({ limit: 10, offset: 0 }, client);
        expect(equipment).toBeDefined();
        expect(equipment.total).toBe(3);
        expect(equipment.rows).toHaveLength(3);
    })

    it("Checks that the list of equipment is displayed, with filters applied", async ()=> {
        const e1 = equipmentData.equipment1;
        const e2 = equipmentData.equipment2;
        const e3 = equipmentData.equipment3;
        await equipmentRepo.create(e1, client);
        await equipmentRepo.create(e2, client);
        const rifle = await equipmentRepo.create(e3, client);
        await equipmentRepo.update(rifle.id, {category: "Rifle"}, client);
        const equipment = await equipmentRepo.list(
            {
                category: "Pestol",
                limit: 10,
                offset: 0
            },
            client);
        expect(equipment).toBeDefined();
        expect(equipment.total).toBe(2);
        expect(equipment.rows).toHaveLength(2);
    })

    it("Checks that the equipment is correctly updated by ID", async()=> {
        const e1 = equipmentData.equipment1;
        const equipment1 = await equipmentRepo.create(e1, client);
        const equipment = await equipmentRepo.update(equipment1.id,
            {
                description: "M4",
                category: "Assault Rifle"
            },
            client);
        expect(equipment).toBeDefined();
        expect(equipment.description).toBe("M4");
        expect(equipment.category).toBe("Assault Rifle");
    })

    it("Checks that the equipment status is correctly updated by ID", async()=> {
        const e1 = equipmentData.equipment1;
        const equipment1 = await equipmentRepo.create(e1, client);
        const equipment = await equipmentRepo.updateStatus(equipment1.id, "booked", client);
        expect(equipment).toBeDefined();
        expect(equipment.status).toBe("booked");
    })

    it("Checks that the equipment is correctly deleted by ID", async()=> {
        const e1 = equipmentData.equipment1;
        const equipment1 = await equipmentRepo.create(e1, client);
        const equipment = await equipmentRepo.remove(equipment1.id);
        expect(equipment).toBeDefined();
    })

    it("Checks that the list of equipment is displayed by availability status", async()=> {
        const e1 = equipmentData.equipment1;
        const e2 = equipmentData.equipment2;
        const e3 = equipmentData.equipment3;
        await equipmentRepo.create(e1, client);
        await equipmentRepo.create(e2, client);
        await equipmentRepo.create(e3, client);
        const equipment = await equipmentRepo.availability(client);
        expect(equipment).toBeDefined();
        expect(equipment).toEqual(
            expect.arrayContaining([
                {status: "available", count: 3}
            ])
        );
    });

});