const db = require("../../src/database/connection")
const userRepo = require("../../src/repositories/user.repository")
const userData = require("./helpers/models/users")

describe("User integration test", ()=>{

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

      it("Checks weather the correct user gets created", async ()=>{
        const u1 = userData.user1;
        const user = await userRepo.create(u1, client);
        expect(user).toBeDefined();
        expect(user.fullName).toBe(u1.full_name);
        expect(user.email).toBe(u1.email);
      })

      it("Checks weather that you get correct user using find by id", async ()=>{

        const u2 = userData.user2;
        const user1 = await userRepo.create(u2, client);
        const user = await userRepo.findById(user1.id, client);
        expect(user).toBeDefined();
        expect(user.id).toBe(user1.id);
        expect(user.full_name).toBe(user1.full_name)
        expect(user.email).toBe(user1.email)
      })

      it("checks weather that you get correct user using find by email", async ()=>{
        const u2 = userData.user2;
        const user1 = await userRepo.create(u2, client);
        const user = await userRepo.findByEmail(user1.email, client);
        expect(user).toBeDefined();
        expect(user.id).toBe(user1.id);
        expect(user.full_name).toBe(user1.full_name)
        expect(user.email).toBe(user1.email)
      })

      it("checks weather that you get correct users list", async ()=>{
        const u1 = userData.user1;
        const user1 = await userRepo.create(u1, client);
        const u2 = userData.user2;
        const user2 = await userRepo.create(u2, client);
        const u3 = userData.user3;
        const user3 = await userRepo.create(u3, client);
        
        const expectedUsers = [user1, user2, user3];
        const users = await userRepo.list(client);

        expect(Array.isArray(users)).toBe(true);
        expect(users.length).toBe(3);

        for (let i = 0; i < expectedUsers.length; i++) {
            expect(users[i].id).toBe(expectedUsers[i].id);
            expect(users[i].email).toBe(expectedUsers[i].email);
            expect(users[i].full_name).toBe(expectedUsers[i].full_name);
        }


      })
    })