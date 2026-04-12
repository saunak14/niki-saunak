# NikiSaunak Website Frontend

This repo contains the frontend for the nikisaunak.com website written in Angular. This project is a joint collaboration with @nikitasreenath

## Installation Instructions

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
Inside the project directory run the following commands:

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

```bash
# Build the Docker image (runs the Angular build internally)
docker build -t niki-saunak .

# Start the container
docker run --rm -p 8080:80 niki-saunak
```

Once running, open your browser and navigate to `http://localhost:8080/`

> [!NOTE]
> The Docker build runs `npm ci` and `npm run build` inside the container, so no local Node.js installation is needed. The final image contains only NGINX and the compiled static files.