import './App.css';

const App = () => {
  // Mercury Server variables
  const serverUrl = process.env.REACT_APP_MERCURY_SERVER || "http://localhost:8000";
  const bitcoinNetwork = process.env.REACT_APP_BITCOIN_NETWORK || "regtest";
  const lockHeightInit = process.env.REACT_APP_LOCKHEIGHT_INIT || "1000";
  const lhDecrement = process.env.REACT_APP_LH_DECREMENT || "10";
  const batchTimeout = process.env.REACT_APP_BATCH_TIMEOUT || "20";
  const enclaves = process.env.REACT_APP_ENCLAVES || "[]";

  // Database (db_server) variables
  const dbUser = process.env.REACT_APP_DB_USER || "postgres";
  const dbPassword = process.env.REACT_APP_DB_PASSWORD || "postgres";
  const dbHost = process.env.REACT_APP_DB_HOST || "db_server";
  const dbPort = process.env.REACT_APP_DB_PORT || "5432";
  const dbName = process.env.REACT_APP_DB_NAME || "mercury";

  // Database (db_lockbox) variables
  const lockboxDbUser = process.env.REACT_APP_LOCKBOX_DB_USER || "postgres";
  const lockboxDbPassword = process.env.REACT_APP_LOCKBOX_DB_PASSWORD || "postgres";
  const lockboxDbHost = process.env.REACT_APP_LOCKBOX_DB_HOST || "db_lockbox";
  const lockboxDbPort = process.env.REACT_APP_LOCKBOX_DB_PORT || "5432";
  const lockboxDbName = process.env.REACT_APP_LOCKBOX_DB_NAME || "enclave";

  // Lockbox variables
  const lockboxUrl = process.env.REACT_APP_LOCKBOX_DATABASE_URL || "postgres://postgres:postgres@db_lockbox:5432/enclave";
  const lockboxPort = process.env.REACT_APP_LOCKBOX_PORT || "18080";
  const keyManager = process.env.REACT_APP_KEY_MANAGER || "hashicorp_container";
  const hashicorpToken = process.env.REACT_APP_HASHICORP_CONTAINER_TOKEN || "N/A";
  const hashicorpUrl = process.env.REACT_APP_HASHICORP_CONTAINER_URL || "http://vault:8200";
  const hashicorpPath = process.env.REACT_APP_HASHICORP_CONTAINER_PATH || "mercury-seed";
  const hashicorpMountPoint = process.env.REACT_APP_HASHICORP_CONTAINER_MOUNT_POINT || "secret";
  const hashicorpKeyName = process.env.REACT_APP_HASHICORP_CONTAINER_KEY_NAME || "seed";

  // Vault variables
  const vaultToken = process.env.REACT_APP_VAULT_DEV_ROOT_TOKEN_ID || "N/A";
  const vaultPort = process.env.REACT_APP_VAULT_PORT || "8200";

  return (
    <div className="App">
      <header className="App-header">
        <h1>Mercury Layer Environment Details</h1>
        <p>This app runs as a background service, the details of it are listed below</p>

        <h2>Mercury Server</h2>
        <ul>
          <li>Server URL: <a href={serverUrl}>{serverUrl}</a></li>
          <li>Bitcoin Network: {bitcoinNetwork}</li>
          <li>Lock Height Init: {lockHeightInit}</li>
          <li>LH Decrement: {lhDecrement}</li>
          <li>Batch Timeout: {batchTimeout}</li>
          <li>Enclaves: {enclaves}</li>
        </ul>

        <h2>Database (db_server)</h2>
        <ul>
          <li>Database User: {dbUser}</li>
          <li>Database Password: {dbPassword}</li>
          <li>Database Host: {dbHost}</li>
          <li>Database Port: {dbPort}</li>
          <li>Database Name: {dbName}</li>
        </ul>

        <h2>Database (db_lockbox)</h2>
        <ul>
          <li>Database User: {lockboxDbUser}</li>
          <li>Database Password: {lockboxDbPassword}</li>
          <li>Database Host: {lockboxDbHost}</li>
          <li>Database Port: {lockboxDbPort}</li>
          <li>Database Name: {lockboxDbName}</li>
        </ul>

        <h2>Lockbox</h2>
        <ul>
          <li>Database URL: {lockboxUrl}</li>
          <li>Port: {lockboxPort}</li>
          <li>Key Manager: {keyManager}</li>
          <li>HashiCorp Token: {hashicorpToken}</li>
          <li>HashiCorp URL: {hashicorpUrl}</li>
          <li>HashiCorp Path: {hashicorpPath}</li>
          <li>HashiCorp Mount Point: {hashicorpMountPoint}</li>
          <li>HashiCorp Key Name: {hashicorpKeyName}</li>
        </ul>

        <h2>Vault</h2>
        <ul>
          <li>Dev Root Token: {vaultToken}</li>
          <li>Port: {vaultPort}</li>
        </ul>
      </header>
    </div>
  );
}

export default App;
