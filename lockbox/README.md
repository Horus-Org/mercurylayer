## Lockbox server

### 1. Running from source:

1. Install necessary packages: `sudo apt-get -y install libpq-dev autoconf automake libtool`
2. Install vcpkg package manager, following the instruction [here](https://learn.microsoft.com/en-us/vcpkg/get_started/get-started?pivots=shell-bash).
3. Install `ninja` build system (`sudo apt-get -y install ninja-build`).
3. Then run the commands below:

```bash
$ mkdir -p build && cd build
$ cmake --preset=vcpkg ..
$ cmake --build .
```
4. Set the desired key manager in `Settings.toml`. Currently, there are 4 available: `google_kms`, `hashicorp_container`, `hashicorp_api` and `filesystem`.

5. Copy the `Settings.toml` file: `$ cp ../Settings.toml .` 

6. Then, to run the server: `$ ./MercuryLockbox`.

### 2. Running from Dockerfile:

1. Edit the `.env` file according to your personal settings.

2. Run `$ docker build -t mercury-lockbox .`
3.  1. For `filesystem` or `hashicorp` key manager, you can run `$ docker run --env-file .env mercury-lockbox`.
    2. For `google_kms` key manager, you need to pass your service account key file at runtime:
    ```bash
    docker run --env-file .env \
        -v /path/to/service-account-key.json:/app/credentials.json \
        -e GOOGLE_APPLICATION_CREDENTIALS=/app/credentials.json \
        mercury-lockbox
    ```

