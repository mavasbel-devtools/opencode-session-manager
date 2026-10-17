// Preloaded by every test run (bunfig.toml and the coverage bunfigs): the tests
// may run inside a Herdr pane, and a plugin set up from them must never report
// to the user's own Herdr. A test that wants Herdr passes its own environment.
for (const name of ["HERDR_ENV", "HERDR_SOCKET_PATH", "HERDR_PANE_ID", "HERDR_WORKSPACE_ID", "HERDR_TAB_ID"]) delete process.env[name]
