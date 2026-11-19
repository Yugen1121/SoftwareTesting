const bcrypt = require("bcrypt")

jest.mock("../../src/repositories/user.repository", () => ({
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    list: jest.fn()

}));

const users = require("../../src/repositories/user.repository");
const auth = require("../../src/services/auth.service");

describe("Auth Service unit test for Registration", () => {

    let validUser;

    beforeEach(() => {
        jest.clearAllMocks();

        validUser = {
            fullName: "John Smith",
            email: "john@example.com",
            password: "StrongPass123!",
            role: "user"
        };

        users.findByEmail.mockResolvedValue(null);

        users.create.mockImplementation(async (user) => ({
            id: 1,
            ...user
        }));
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    afterAll(() => {
        jest.restoreAllMocks();
    });

    it("should register a user successfully", async () => {
        const result = await auth.register(validUser);


        expect(result).toEqual(expect.objectContaining({
            fullName: validUser.fullName,
            email: validUser.email,
            role: "user"
        }));

        expect(result.passwordHash).not.toBe(validUser.passwordHash);
    });

    it("should reject a full name shorter than 5 characters", async () => {
        const invalidUser = {
            ...validUser,
            fullName: "John"
        };

        await expect(auth.register(invalidUser))
            .rejects.toThrow("Full name must be at least 5 characters long.");

        expect(users.create).not.toHaveBeenCalled();
    });

    it("should reject an invalid email", async () => {
        const invalidUser = {
            ...validUser,
            email: "invalid-email"
        };

        await expect(auth.register(invalidUser))
            .rejects.toThrow("Please provide a valid email address.");

        expect(users.create).not.toHaveBeenCalled();
        expect(users.findByEmail).not.toHaveBeenCalled();
    });

    it("should reject a weak password", async () => {
        const invalidUser = {
            ...validUser,
            password: "weak"
        };

        await expect(auth.register(invalidUser))
            .rejects.toThrow("Password must be at least 8 characters");

        expect(users.create).not.toHaveBeenCalled();
    });

    it("should reject registration if email already exists", async () => {
        users.findByEmail.mockResolvedValue({
            id: 2,
            email: validUser.email,

        });

        await expect(auth.register(validUser))
            .rejects.toThrow("Email is already registered.");

        expect(users.findByEmail).toHaveBeenCalledWith(validUser.email);
        expect(users.create).not.toHaveBeenCalled();
    });

    test("should call create with the correct user data", async () => {
        await auth.register(validUser);

        expect(users.create).toHaveBeenCalledWith(
            expect.objectContaining({
                fullName: validUser.fullName,
                email: validUser.email,
                role: "user",
                passwordHash: expect.any(String)
            })
        );
    });

    test("should throw an error if user creation fails", async () => {
        users.create.mockRejectedValue(new Error("Database error"));

        await expect(auth.register(validUser))
            .rejects.toThrow("Database error");

        expect(users.create).toHaveBeenCalledTimes(1);
    });

});


describe("Auth Service unit test for Login", ()=>{
    let validUser;
    let hashedPassword;

    beforeEach(async ()=>{
        jest.clearAllMocks()

        validUser = {
            id: 1,
            fullName: "John Smith",
            email: "john@example.com",
            password: "Qwerty123!",
            role: "user"
        }
        
        hashedPassword = await bcrypt.hash(validUser.password, 12)

        users.findByEmail.mockResolvedValue(async ()=>(
            null
        ));

        users.create.mockResolvedValue( async (user)=>(
            {
                id: 1,
                ...user,
                hashedPassword: hashedPassword
            }
        ));
    })

    afterEach(()=>{
        jest.resetAllMocks();
    })

    afterAll(()=>{
        jest.restoreAllMocks();
    })

    it.each(
        [
            "email.com",
            ".com",
            "12345@gmail.com",
            "qwertt@.com"
        ]
    )("should reject invalid email: $s", async (email)=>{
        let invalidUser = {email: email, password: "Qwerty123!"}
        await expect(auth.login(invalidUser)).rejects.toThrow(
            
        )
    })

    it.each([
        "weak",
        "Weakerasf",
        "Weak123345",
        "!!!!!!qwett",
        "1235678!!!!!!"
    ])("should reject invalid password: $s", async (password)=>{
        let invalidUser = {
            email: "example1@gmail.com",
            password: password
        }

        await expect(auth.login(invalidUser)).rejects.toThrow(
            ""
        )
    })

    it("should reject unregistered credentials", async ()=>{
        const credential = {email: "example1@gmail.com", password: "Qwerty12345!"}
        await expect(auth.login(credential)).rejects.toThrow(
            ""
        )
    })

    it("should login user successfully", async()=>{
        const user = { 
            full_name: "Test Test",
            email: "example1@gmail.com",
            role: "user",
            is_active: true,
            password: "Qwerty123!",
            password_hash: hashedPassword
        }

        console.log(0, user.password_hash)
        users.findByEmail.mockResolvedValue(
                user
        )
        console.log("Mock result within it:", await users.findByEmail(user.email));
        const response = await auth.login({
            email: user.email, password: user.password})

        expect(response).toBeDefined();
        expect(response.token).toBeDefined();
        expect(response.user).toBeDefined();;
        const returnedUser = response.user;
        expect(returnedUser.email).toBe(user.email);
        expect(returnedUser.fullName).toBe(user.full_name);
        expect(returnedUser.role).toBe(user.role);
    })
})