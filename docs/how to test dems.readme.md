Follow these steps to test the DEMS (Data Event Monitoring Service):

1. Docker compose up to set up the correct environment and infrastructure:

   ```bash
   docker-compose up -d
   ```

2. Make sure you have the .env file configured with the necessary environment variables for DEMS.
   - Refer to env.sample for guidance.

3. Database Tables:
   - The required database tables (`config` and `dems_quarantine`) will be automatically created when you start the Docker containers.
   - The initialization scripts are located in `database/init/` and are automatically executed by PostgreSQL on first startup.

4. Insert Test Data:
   - Use SQL scripts or your database client to insert test data into the relevant tables (config table) in the DEMS database.

5. Keycloak Setup (if applicable):
   - Ensure that Keycloak is running and configured correctly.
   - Create necessary realms, clients, and users for authentication.
   - dems:write claim is required for testing write operations.

6. Get a JWT Token:
   - Use a tool like Postman or curl to make a POST request to the authentication endpoint of the auth-service to obtain a JWT token.
   - Make sure the request includes valid user claims.

7. Start up the DEMS service:

   ```bash
   npm run start:dev
   ```

8. Test the DEMS API Endpoints:
   - Use the obtained JWT token to authenticate your requests to the DEMS API endpoints.
