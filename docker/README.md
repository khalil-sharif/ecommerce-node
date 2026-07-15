# Docker services

`docker-compose.yml` (repo root) provisions the full local stack:

| Service       | Port(s)      | Purpose                          |
| ------------- | ------------ | -------------------------------- |
| api           | 3000         | NestJS application               |
| postgres      | 5432         | Primary database                 |
| redis         | 6379         | BullMQ queues + caching          |
| elasticsearch | 9200         | Product search index             |
| minio         | 9000 / 9001  | S3-compatible image storage      |
| kibana        | 5601         | ES inspection (profile `tools`)  |
| pgadmin       | 5050         | DB inspection (profile `tools`)  |

```bash
# Core services only
docker compose up -d postgres redis elasticsearch minio

# Everything including admin tools
docker compose --profile tools up -d
```
