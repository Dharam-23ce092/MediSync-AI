/** Retired: identity aliases and shared passwords must not be recreated. */
console.error('Legacy user synchronization has been retired. Manage users through the application, or explicitly reset with npm run seed -- --reset.');
process.exitCode = 1;
