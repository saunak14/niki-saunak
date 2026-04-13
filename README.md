# NikiSaunak Website

This repo contains code for the nikisaunak.com website. The frontend is written in Angular and the backend is written with Python. This project is a joint collaboration with [@nikitasreenath](https://github.com/nikitasreenath)

## Local Installation Instructions

### Prerequisites

Ensure that Angular is installed on your machine. To check whether it is installed run the following commands:

```bash
node -v
npm -v
ng --version
```

If any of these aren't installed follow these instructions to install them:

### Install Angular

> [!NOTE]
> These were taken from the official [Nodejs](https://nodejs.org/en/download) and [Angular](https://angular.dev/installation) installation guides. In case these instructions are outdated, please refer to the official guide

#### Install Nodejs

##### Windows
Use the prebuilt .msi installer from the above link

##### MacOS & Linux
```bash
# Download and install nvm:
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash

# in lieu of restarting the shell
\. "$HOME/.nvm/nvm.sh"

# Download and install Node.js:
nvm install 24

# Verify the Node.js version:
node -v # Should print "v24.14.1".

# Verify npm version:
npm -v # Should print "11.11.0".
```

#### Install Angular

```bash
npm install -g @angular/cli
```

### Running Application
Inside the `frontend/` directory run the following commands:

#### Install Dependencies
```bash
npm install
```

#### Start Application

```bash
npm start
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`

---

## Running with Docker

Docker is an alternative way to run the application locally without installing Node.js or Angular. It also mirrors the production environment.

### Prerequisites

Ensure Docker is installed on your machine:

```bash
docker --version
```

If it isn't installed, follow the [official Docker installation guide](https://docs.docker.com/get-docker/) for your platform.

### Build and Run

#### Option A - Run everything with Docker Compose (recommended)

```bash
docker-compose up --build
```

#### Option B - Run Frontend & Backend containers seperately

```bash
# Build the frontend Docker image (runs the Angular build internally)
docker build -f frontend/Dockerfile frontend/ -t niki-saunak-frontend

# Start the container
docker run --rm -p 8080:80 niki-saunak-frontend
```

```bash
# Build the backend Docker image
docker build -f backend/Dockerfile backend/ -t niki-saunak-backend

# Start the backend container
docker run --rm -p 8000:8000 niki-saunak-backend
```
Once running, open your browser and navigate to `http://localhost:8080/` for the website view. The backend API can be queried  at `http://localhost:8000/`


> [!NOTE]
> The Docker build runs `npm ci` and `npm run build` inside the container, so no local Node.js installation is needed. The final image contains only NGINX and the compiled static files.

## CI/CD

CI/CD pipeline is setup using [GitHub Actions](https://docs.github.com/en/actions/get-started/quickstart). Currently the workflow is executed when a new Release Tag is created from `main` branch. It can be run manually for feature branches.

There are two stages of the CI/CD pipelines:
- **docker-build**: builds and tags the image, then pushes it to Docker Hub
- **deploy-new-image**: pulls the image to the server, then replaces the docker container

## Hosting

Application is self-hosted on a [Digital Ocean Droplet](https://www.digitalocean.com/products/droplets) hosted [here](https://cloud.digitalocean.com/droplets/564358476/graphs?i=975c64&period=hour) with custom domain and SSL from [porkbun.com](https://porkbun.com/account/domainsSpeedy).

##
**Application can be reached at [nikisaunak.com](https://nikisaunak.com/)!**
