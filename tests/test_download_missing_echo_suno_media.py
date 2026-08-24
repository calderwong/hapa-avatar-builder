import importlib.util
import pathlib
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "download_missing_echo_suno_media",
    ROOT / "scripts" / "download-missing-echo-suno-media.py",
)
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


class EchoSunoMediaValidationTest(unittest.TestCase):
    def test_detects_supported_audio_containers_from_bytes(self):
        fixtures = {
            "track.mp3": b"ID3\x04\x00\x00" + bytes(64),
            "track.m4a": b"\x00\x00\x00\x18ftypM4A " + bytes(64),
            "track.wav": b"RIFF\x10\x00\x00\x00WAVE" + bytes(64),
            "track.flac": b"fLaC" + bytes(64),
            "track.ogg": b"OggS" + bytes(64),
            "track.webm": b"\x1a\x45\xdf\xa3" + bytes(64),
        }
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            for name, payload in fixtures.items():
                path = root / name
                path.write_bytes(payload)
                self.assertIsNotNone(module.audio_container_format(path), name)

    def test_rejects_and_preserves_opaque_audio_payload(self):
        with tempfile.TemporaryDirectory() as directory:
            source = pathlib.Path(directory) / "song.m4a"
            payload = bytes(range(64))
            source.write_bytes(payload)

            self.assertIsNone(module.audio_container_format(source))
            preserved = module.preserve_opaque_audio(source)

            self.assertFalse(source.exists())
            self.assertEqual(preserved.name, "song.opaque-source.m4a")
            self.assertEqual(preserved.read_bytes(), payload)

    def test_builds_suno_playable_mp3_derivative_url(self):
        song_id = "43b0882c-84f0-4682-9802-2125aed8f8b5"
        self.assertEqual(
            module.suno_playable_mp3_url(song_id),
            f"https://cdn1.suno.ai/{song_id}_lyrics.mp3",
        )


if __name__ == "__main__":
    unittest.main()
