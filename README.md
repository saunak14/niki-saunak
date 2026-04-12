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