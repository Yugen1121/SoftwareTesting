const db = require("../../src/database/connection")
const equipRepo = require("../../src/repositories/equipment.repository")
const equipData = require("./helpers/models/equipments")

describe("Equipment integration test", ()=>{

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
        const e1 = equipData.equipment1;
        const equipment = await equipRepo.create(e1, client);
        expect(equipment).toBeDefined();
        expect(equipment.name).toBe(e1.name);
        expect(equipment.description).toBe(e1.description);
    })

    it("Checks that the correct equipment is displayed when searching by ID", async ()=> {
        const e1 = equipData.equipment1;
        const equipment1 = await equipRepo.create(e1, client);
        const equipment = await equipRepo.findById(equipment1.id, client);
        expect(equipment).toBeDefined();
        expect(equipment.id).toBe(equipment1.id);
        expect(equipment.name).toBe(equipment1.name);
        expect(equipment.description).toBe(equipment1.description);
    })

    it("Checks that the list of equipment is displayed correctly", async ()=> {
        
    })

    it("Checks that the equipment is correctly updated by ID", async()=> {
        const e1 = equipData.equipment1;
        const equipment1 = await equipRepo.create(e1, client);
        const equipment = await equipRepo.update(equipment1.id,
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
        const e1 = equipData.equipment1;
        const equipment1 = await equipRepo.create(e1, client);
        const equipment = await equipRepo.updateStatus(equipment1.id, "booked", client);
        expect(equipment).toBeDefined();
        expect(equipment.status).toBe("booked");
    })

    it("Checks that the equipment is correctly deleted by ID", async()=> {
        const e1 = equipData.equipment1;
        const equipment1 = await equipRepo.create(e1, client);
        const equipment = await equipRepo.remove(equipment1.id);
        expect(equipment).toBeDefined();
    })

    it("Checks that the list of equipment is displayed by availability status", async()=> {
        const e1 = equipData.equipment1;
        const equipment1 = await equipRepo.create(e1, client);
        const e2 = equipData.equipment2;
        const equipment2 = await equipRepo.create(e2, client);
        const e3 = equipData.equipment3;
        const equipment3 = await equipRepo.create(e3, client);
        const equipment = await equipRepo.availability(client);
        expect(equipment).toBeDefined();
        expect(equipment).toEqual(
            expect.arrayContaining([
                {status: "available", count: 3}
            ])
        );
    })

    })