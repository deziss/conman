
# Conman: Docker Container Monitor Tool

Conman is a tool designed to monitor Docker containers, providing insights and alerts for container health, resource usage, and events. This project is structured for easy extension and deployment.

## Project Structure

- `src/` — Main source code
- `tests/` — Unit tests
- `scripts/` — Utility scripts (setup, etc.)
- `requirements.txt` — Python dependencies
- `config.yaml` — Main configuration file
- `.env` — Environment variables
- `.gitignore` & `.gitattributes` — Git configuration
- `Dockerfile` — Containerization setup

## Getting Started

### 1. Clone the repository

```bash
git clone https://git.nuvoai.io/docker/conman.git
cd conman
```

### 2. Set up Python environment

```bash
bash scripts/setup.sh
```

### 3. Run the tool

```bash
python src/main.py
```

### 4. Run tests

```bash
python -m unittest discover tests
```

### 5. Build and run with Docker

```bash
docker build -t conman .
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock conman
```

## Configuration

Edit `config.yaml` and `.env` to customize monitoring intervals, log levels, and Docker socket path.

## Contributing

Pull requests and issues are welcome! Please follow standard Python and Docker best practices.

## License

MIT



