# DEMS - Dynamic Event Monitoring System

To test the DEMS (Data Event Monitoring Service), follow the instructions mentioned in /docs/how to test dems.readme.md

A high-performance runtime engine for the Tazama Financial Risk Management System (FRMS) that receives, validates, processes, and routes financial transaction requests to the Event Director while maintaining comprehensive data persistence and monitoring capabilities.

## 🏗️ Architecture Overview

DEMS serves as a critical middleware component in the Tazama FRMS ecosystem, acting as:

- **Request Gateway**: Receives and validates incoming financial transaction requests
- **Schema Validator**: Ensures data integrity using JSON Schema validation with AJV
- **Data Processor**: Transforms and normalizes transaction data (XML/JSON)
- **Event Router**: Routes processed transactions to the Event Director via NATS messaging
- **Data Persistence**: Stores transaction relationships and metadata in PostgreSQL
- **Cache Manager**: Utilizes Redis for high-performance schema and configuration caching

## ✨ Key Features

### 🔒 Security & Authentication

- **JWT-based Authentication**: Secure token validation using Tazama Auth Library
- **Role-based Access Control**: Fine-grained permissions with DEMS write roles
- **Input Validation**: Comprehensive request sanitization and validation

### 🚀 Performance & Scalability

- **Redis Caching**: Sub-millisecond schema and configuration retrieval
- **Connection Pooling**: Optimized database connections for high throughput
- **Asynchronous Processing**: Non-blocking request handling with NestJS
- **APM Integration**: Real-time performance monitoring and transaction tracing

### 📊 Data Processing

- **Multi-format Support**: Native XML and JSON transaction processing
- **Schema-aware Transformation**: Dynamic field conversion based on JSON schemas
- **Transaction Relationship Mapping**: Automatic relationship detection and storage
- **Event Sourcing**: Complete audit trail of all transaction events

### 🔄 Integration Capabilities

- **NATS Messaging**: Reliable event streaming to downstream services
- **PostgreSQL Persistence**: ACID-compliant transaction data storage
- **RESTful API**: Standard HTTP/HTTPS endpoint exposure
- **Docker Ready**: Containerized deployment with multi-stage builds

## 🛠️ Technology Stack

| Component      | Technology     | Version |
| -------------- | -------------- | ------- |
| **Runtime**    | Node.js        | 20+     |
| **Framework**  | NestJS         | ^11.0.1 |
| **Language**   | TypeScript     | ^5.7.3  |
| **Database**   | PostgreSQL     | 15+     |
| **Cache**      | Redis          | 7+      |
| **Messaging**  | NATS JetStream | 2.10+   |
| **Validation** | AJV            | ^8.17.1 |
| **Testing**    | Jest           | ^30.0.0 |
| **Monitoring** | Custom APM     | -       |

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 15+
- Redis 7+
- NATS Server 2.10+

### Installation

1. **Clone the repository**

```bash
git clone <repository-url>
cd event-monitoring-service
```

2. **Install dependencies**

```bash
npm install
```

3. **Environment setup**

```bash
cp .env.example .env
# Configure your environment variables
```

4. **Start infrastructure services**

```bash
docker-compose up -d redis nats
```

5. **Database setup**

```bash
# Run your PostgreSQL instance and execute schema migrations
npm run db:migrate
```

6. **Development server**

```bash
set -a && source .env && set +a && npm run start:dev
```

The service will be available at `http://localhost:3002`

## 🔧 Configuration

### Environment Variables

```bash
# Application
PORT=3002
NODE_ENV=development

# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=tcs
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres

# Redis Cache
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redis-password
CACHE_TTL=3600

# NATS Messaging
NATS_URL=nats://localhost:4222
NATS_CONSUMER_GROUP=dems-consumer

# Authentication
JWT_SECRET=your-jwt-secret
AUTH_SERVICE_URL=http://localhost:3001

# APM & Monitoring
APM_SERVICE_NAME=dems
APM_ENVIRONMENT=development
LOG_LEVEL=info
```

## 📡 API Reference

### Transaction Processing Endpoint

#### POST `/dems-engine/*endpoint`

Processes financial transaction requests and routes them to the Event Director.

**Headers:**

```http
Authorization: Bearer <jwt-token>
Content-Type: application/json | application/xml
```

**URL Parameters:**

- `endpoint` (string): Comma-separated endpoint identifier (e.g., "pacs,008,001,10")

**Request Body:**

```json
{
  "transactionDetails": {
    "source": "string",
    "destination": "string",
    "TxTp": "string",
    "tenantId": "string",
    "MsgId": "string",
    "CreDtTm": "2024-01-01T00:00:00Z",
    "EndToEndId": "string"
  }
  // Additional transaction data...
}
```

**Response:**

```json
{
  "message": "Everything is OK!",
  "isMatch": true,
  "transactionRelationship": {
    "id": "uuid",
    "source": "string",
    "destination": "string",
    "transactionType": "string"
  },
  "schema": {
    /* JSON Schema */
  },
  "payload": {
    /* Processed transaction data */
  }
}
```

**Error Response:**

```json
{
  "message": "Validation failed",
  "differences": ["Field 'amount' is required"],
  "schema": {
    /* JSON Schema */
  }
}
```

## 🏃‍♂️ Development

````

### Testing

The project maintains **96%+ test coverage** with comprehensive unit and integration tests:

```bash
# Run all tests with coverage
npm run test:cov

# Watch mode for development
npm run test:watch

# End-to-end testing
npm run test:e2e
````

### Code Quality

- **ESLint**: Enforces code style and catches potential issues
- **Prettier**: Ensures consistent code formatting
- **Husky**: Pre-commit hooks for quality gates
- **TypeScript**: Strong typing for enhanced developer experience

## 🐳 Docker Deployment

### Build & Run

```bash
# Build the Docker image
docker build -t dems:latest .

# Run with Docker Compose
docker-compose up -d

# Production deployment
docker-compose -f docker-compose.prod.yml up -d
```

### Container Configuration

The multi-stage Dockerfile optimizes for:

- **Build efficiency**: Separate build and runtime stages
- **Security**: Non-root user execution
- **Size optimization**: Alpine-based images
- **Performance**: Production-ready Node.js configuration

## 📊 Monitoring & Observability

### APM Integration

- **Transaction Tracing**: End-to-end request tracking
- **Performance Metrics**: Response times, throughput, error rates
- **Custom Spans**: Detailed operation-level monitoring
- **Health Checks**: Service availability monitoring

### Logging

- **Structured Logging**: JSON-formatted log entries
- **Correlation IDs**: Request tracking across services
- **Log Levels**: Configurable verbosity (error, warn, info, debug)
- **Audit Trail**: Complete transaction processing history

## 🔄 Integration Patterns

### Event-Driven Architecture

```
Client Request → DEMS → Schema Validation → Data Transform → Event Director
                  ↓
             Database Storage ← Redis Cache ← NATS Messaging
```

### Data Flow

1. **Request Reception**: HTTP/HTTPS endpoint receives transaction
2. **Authentication**: JWT token validation and role verification
3. **Schema Lookup**: Redis cache retrieval of validation schemas
4. **Data Validation**: AJV-based JSON Schema validation
5. **Data Transformation**: XML-to-JSON conversion and field mapping
6. **Relationship Mapping**: Transaction relationship detection
7. **Persistence**: PostgreSQL storage of transaction metadata
8. **Event Publishing**: NATS message publication to Event Director
9. **Response**: Success confirmation or detailed error response

## 🤝 Contributing

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Write tests**: Ensure 95%+ test coverage
4. **Run quality checks**: `npm run lint && npm run test`
5. **Commit changes**: `git commit -m 'Add amazing feature'`
6. **Push to branch**: `git push origin feature/amazing-feature`
7. **Open a Pull Request**

### Development Guidelines

- Follow TypeScript best practices
- Maintain test coverage above 95%
- Use conventional commit messages
- Update documentation for new features
- Ensure all CI/CD checks pass

## 📄 License

This project is licensed under the UNLICENSED License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:

- **Documentation**: [Tazama FRMS Docs](https://tazama-lf.github.io/)
- **Issues**: [GitHub Issues](https://github.com/tazama-lf/event-monitoring-service/issues)
- **Community**: [Tazama Community](https://community.tazama.org/)

---

**Made with ❤️ by the Tazama Team**
