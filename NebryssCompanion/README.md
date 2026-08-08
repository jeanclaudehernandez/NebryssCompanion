# NebryssCompanion

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 18.0.6.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Local Full-Stack Development (No Ngrok / No DuckDNS)

For team development when working on separate machines without tunnel conflicts:

```bash
# Start DB, WS, API and build Frontend for local development
npm run start:local

# Or with live rebuild watch mode
npm run start:local -- --watch

# Or on Windows using batch script
start-local.bat
```

This launches:
- **Database**: Local MongoDB instance (or automatic Local JSON Filesystem fallback)
- **API Server**: Express REST API on `http://localhost:8080/api`
- **WebSocket Server**: Real-time sync on `ws://localhost:8080/ws`
- **Frontend App**: Unified local PWA served on `http://localhost:8080` (and on LAN IP for testing across local mobile devices)

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

