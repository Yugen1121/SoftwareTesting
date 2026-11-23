

jest.mock("../../src/repositories/equipment.repository", () => ({
    findById: jest.fn()
}));

jest.mock("../../src/repositories/fault.repository", () => ({
    create: jest.fn(),
    findById: jest.fn(),
    list: jest.fn(),
    update: jest.fn()
}));

const equipmentRepo = require("../../src/repositories/equipment.repository");
const faultRepo = require("../../src/repositories/fault.repository");
const userRepo = require("../../src/repositories/user.repository");
const faultService = require("../../src/services/fault.service.js")

describe("Fault creation services unit test on", ()=>{
    beforeEach(()=>{
            jest.clearAllMocks();

    })

    it("checks if the report for an non-existant equipment gets rejected", async () => {
        equipmentRepo.findById.mockResolvedValue(null)
        await expect(faultService.create({ equipmentId: 1 }, { id: 1 }))
         .rejects.toMatchObject({ statusCode: 404 });


    })

    it("check weather it returns valid out put for valid input", async () => {
        const eq1 = {
            equipmentCode: 1,
            name: "gun",
            description: "It's a gun.",
            category: "Firearm",
            location: "lab 1",
            status: "available"
            }
        equipmentRepo.findById.mockResolvedValue(async () => {
            return eq1
        })
        
        faultRepo.create.mockResolvedValue({
            ...eq1, reportedBy: 1
        })

        const fault = await faultService.create(eq1, {id: 1})
        expect(fault).toBeDefined()
        console.log(fault)
        expect(fault).toMatchObject({
            ...eq1, reportedBy: 1
        })
    })
})

describe("Fault update test", ()=>{
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it("Checks weather it rejects fault reports that are non-existent", async () => {
        equipmentRepo.findById.mockResolvedValue(null)
        await expect(faultService.create({ equipmentId: 1 }, { id: 1 }))
         .rejects.toMatchObject({ statusCode: 404 });
    })

    it("Checks weather it return the correct uptaed fault report", async () => {
        
        const existingFault = { id: 1, severity: "medium" };
        const updateData = {
                severity: "high"
            };

        const updatedFault = {
                ...existingFault,
                ...updateData
            };

        faultRepo.findById.mockResolvedValue(existingFault);
        faultRepo.update.mockResolvedValue(updatedFault);

        const result = await faultService.update(1, updateData);

        expect(faultRepo.findById).toHaveBeenCalledWith(1);

        expect(faultRepo.update).toHaveBeenCalledWith(1, updateData);

        expect(result).toEqual(updatedFault);
    })

})