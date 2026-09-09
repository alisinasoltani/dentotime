"""Read-only Compose contract tests; run with unittest without a Django database."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


BACKEND = Path(__file__).resolve().parents[1]
DEMO_KEYS = {
    "DEMO_PUBLIC_HOST": "37.32.37.248",
    "DEMO_SECRET_KEY": "a" * 96,
    "DEMO_JWT_SIGNING_KEY": "b" * 96,
    "DEMO_OTP_HASH_KEY": "c" * 96,
    "DEMO_CAPTCHA_HASH_KEY": "d" * 96,
    "DEMO_STORAGE_SECRET_KEY": "e" * 96,
}


@unittest.skipUnless(shutil.which("docker"), "Docker Compose CLI is required")
class PublicDemoComposeTests(unittest.TestCase):
    def render(self, public=False, missing=None):
        env = {key: value for key, value in os.environ.items() if not key.startswith("DEMO_")}
        if public:
            env.update(DEMO_KEYS)
        if missing:
            env.pop(missing)
        args = [
            "docker", "compose", "--env-file", os.devnull, "-p", "dentotime-demo",
            "-f", str(BACKEND / "docker-compose.demo.yml"),
        ]
        if public:
            args += ["-f", str(BACKEND / "docker-compose.demo-public.yml")]
        result = subprocess.run(
            [*args, "config", "--format", "json"], env=env,
            capture_output=True, text=True, timeout=30,
        )
        if missing:
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(missing, result.stderr)
            return None
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_default_demo_remains_loopback_only(self):
        model = self.render()
        for service in model["services"].values():
            for port in service.get("ports", []):
                self.assertEqual(port["host_ip"], "127.0.0.1")

    def test_public_replaces_ports_without_exposing_internal_services(self):
        model = self.render(public=True)
        ports = [
            (name, port["host_ip"], str(port["published"]), port["target"])
            for name, service in model["services"].items()
            for port in service.get("ports", [])
        ]
        self.assertCountEqual(ports, [
            ("frontend", "0.0.0.0", "3100", 3000),
            ("demo-minio", "0.0.0.0", "19000", 9000),
            ("demo-minio", "127.0.0.1", "19001", 9001),
            ("backend", "127.0.0.1", "18000", 8000),
        ])

    def test_origins_and_private_keys_match_every_runtime_component(self):
        services = self.render(public=True)["services"]
        for name in ("backend", "demo-setup", "file-scanner"):
            env = services[name]["environment"]
            for key in ("SECRET_KEY", "JWT_SIGNING_KEY", "OTP_HASH_KEY", "CAPTCHA_HASH_KEY"):
                self.assertEqual(env[key], DEMO_KEYS[f"DEMO_{key}"])
            self.assertEqual(env["AWS_SECRET_ACCESS_KEY"], DEMO_KEYS["DEMO_STORAGE_SECRET_KEY"])
            self.assertEqual(env["CORS_ALLOWED_ORIGINS"], "http://37.32.37.248:3100")
            self.assertEqual(env["CSRF_TRUSTED_ORIGINS"], "http://37.32.37.248:3100")
            self.assertIn("37.32.37.248", env["ALLOWED_HOSTS"].split(","))
            self.assertEqual(env["AWS_S3_PUBLIC_ENDPOINT_URL"], "http://37.32.37.248:19000")
            self.assertEqual(env["SMS_IR_API_KEY"], "")
            self.assertEqual(env["DJANGO_SETTINGS_MODULE"], "demo.settings")
        storage_env = services["demo-minio"]["environment"]
        self.assertEqual(storage_env["MINIO_ROOT_PASSWORD"], DEMO_KEYS["DEMO_STORAGE_SECRET_KEY"])
        self.assertEqual(storage_env["MINIO_API_CORS_ALLOW_ORIGIN"], "http://37.32.37.248:3100")
        self.assertEqual(
            services["demo-storage-init"]["environment"]["DEMO_STORAGE_SECRET_KEY"],
            DEMO_KEYS["DEMO_STORAGE_SECRET_KEY"],
        )
        for values in (services["frontend"]["build"]["args"], services["frontend"]["environment"]):
            self.assertEqual(values["NEXT_PUBLIC_STORAGE_ORIGIN"], "http://37.32.37.248:19000")
            self.assertEqual(values["NEXT_PUBLIC_API_URL"], "")

    def test_preserves_demo_database_identity_and_volumes(self):
        local = self.render()
        public = self.render(public=True)
        self.assertEqual(public["name"], "dentotime-demo")
        self.assertEqual(public["volumes"], local["volumes"])
        for name in ("backend", "demo-setup", "file-scanner", "demo-postgres"):
            local_env = local["services"][name]["environment"]
            public_env = public["services"][name]["environment"]
            for key in local_env:
                if key.startswith(("DB_", "POSTGRES_")) or key == "AWS_STORAGE_BUCKET_NAME":
                    self.assertEqual(public_env[key], local_env[key])

    def test_missing_host_or_private_keys_prevents_public_startup(self):
        for key in DEMO_KEYS:
            with self.subTest(key=key):
                self.render(public=True, missing=key)


@unittest.skipUnless(os.name == "posix" and shutil.which("bash"), "Run launcher tests on Ubuntu/Bash")
class PublicDemoLauncherTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="dentotime public launcher ")
        self.addCleanup(self.temp.cleanup)
        self.backend = Path(self.temp.name) / "backend"
        (self.backend / "scripts").mkdir(parents=True)
        self.script = self.backend / "scripts/start-public-demo.sh"
        shutil.copyfile(BACKEND / "scripts/start-public-demo.sh", self.script)
        binary_dir = Path(self.temp.name) / "bin"
        binary_dir.mkdir()
        docker_stub = binary_dir / "docker"
        docker_stub.write_text(
            '#!/usr/bin/env bash\n'
            'printf "%s\\n" "$*" >> "$DEMO_TEST_LOG"\n'
            'printf "HOST=%s\\n" "${DEMO_PUBLIC_HOST-unset}" >> "$DEMO_TEST_LOG"\n'
            'if [[ " $* " == *" build "* && "${DEMO_TEST_FAIL_BUILD:-0}" == 1 ]]; then exit 17; fi\n',
            encoding="utf-8",
        )
        docker_stub.chmod(0o755)
        self.log = Path(self.temp.name) / "docker.log"
        self.env = {
            **os.environ,
            "PATH": f"{binary_dir}:{os.environ['PATH']}",
            "DEMO_TEST_LOG": str(self.log),
            "DEMO_PUBLIC_HOST": "wrong-exported-host.example",
        }

    def launch(self, host="37.32.37.248"):
        return subprocess.run(
            ["bash", str(self.script), host], cwd=self.temp.name,
            env=self.env, capture_output=True, text=True, timeout=30,
        )

    def test_creates_private_independent_keys_and_preserves_on_rerun(self):
        first = self.launch()
        self.assertEqual(first.returncode, 0, first.stderr)
        env_file = self.backend / ".env.demo-public"
        contents = env_file.read_text()
        values = dict(line.split("=", 1) for line in contents.splitlines())
        self.assertEqual(env_file.stat().st_mode & 0o777, 0o600)
        self.assertEqual(values.pop("DEMO_PUBLIC_HOST"), "37.32.37.248")
        self.assertEqual(len(set(values.values())), 5)
        for secret in values.values():
            self.assertRegex(secret, r"^[0-9a-f]{96}$")
            self.assertNotIn(secret, first.stdout + first.stderr)
        self.assertEqual(self.launch().returncode, 0)
        self.assertEqual(env_file.read_text(), contents)
        calls = self.log.read_text()
        self.assertNotIn("wrong-exported-host", calls)
        self.assertIn("HOST=unset", calls)
        self.assertNotIn(".env.server", calls)
        self.assertNotIn(" down ", calls)
        self.assertIn("-p dentotime-demo", calls)
        self.assertIn("docker-compose.demo-public.yml", calls)
        self.assertLess(calls.index(" build backend frontend"), calls.index(" up -d --no-build"))

    def test_failed_build_does_not_start_or_stop_containers(self):
        self.env["DEMO_TEST_FAIL_BUILD"] = "1"
        result = self.launch()
        self.assertEqual(result.returncode, 17)
        calls = self.log.read_text()
        self.assertNotIn(" up ", calls)
        self.assertNotIn(" down ", calls)
        self.assertNotIn(" stop ", calls)

    def test_host_change_refuses_to_overwrite_keys_or_reconfigure(self):
        self.assertEqual(self.launch().returncode, 0)
        original = (self.backend / ".env.demo-public").read_text()
        previous_calls = self.log.read_text()
        result = self.launch("example.com")
        self.assertEqual(result.returncode, 2)
        self.assertIn("Host differs", result.stderr)
        self.assertEqual((self.backend / ".env.demo-public").read_text(), original)
        self.assertEqual(self.log.read_text(), previous_calls)

    def test_rejects_urls_ports_and_shell_characters(self):
        for host in ("", "http://37.32.37.248", "37.32.37.248:3100", "$(whoami)", "-Reset"):
            with self.subTest(host=host):
                self.assertEqual(self.launch(host).returncode, 2)
                self.assertFalse((self.backend / ".env.demo-public").exists())
                self.assertFalse(self.log.exists())


if __name__ == "__main__":
    unittest.main()
