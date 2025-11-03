No idea how to start?
Follow these steps to test the DEMS (Data Event Monitoring Service):

1. Docker compose up the DEMS service:

   ```bash
   docker-compose up -d
   ```

2. Verify that the DEMS service is running:

   ```bash
   docker-compose ps
   ```

3. Make sure you have the .env file configured with the necessary environment variables for DEMS.
   - Refer to env.example for guidance.

4. Connect to Database:
   - Use a database client (like pgAdmin, DBeaver, etc.) to connect to the DEMS database using the credentials specified in your .env file.

5. Insert Test Data:
   - Use SQL scripts or your database client to insert test data into the relevant tables in the DEMS database.
6. Get a JWT Token:
   - Use a tool like Postman or curl to make a POST request to the authentication endpoint of the DEMS service to obtain a JWT token.
   - Make sure the request includes valid user claims.

7. Test the DEMS API Endpoints:
   - Use the obtained JWT token to authenticate your requests to the DEMS API endpoints.
