## Local development
For local development following infrastructure is required:
  - PostgreSQL database for each microservice
  - ActiveMQ message broker for microservice communication

### To setup local environment run:
```bash
docker-compose up
```

## ActiveMQ
The JMX broker listens on port 61616 and the Web Console on port 8161.