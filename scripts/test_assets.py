import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image, ImageDraw

spec = importlib.util.spec_from_file_location('assets', Path(__file__).with_name('prepare-assets.py'))
assets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assets)


class AssetsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='grimoire-assets-test-')
        self.root = Path(self.tmp.name)
        self.public = self.root / 'public'
        self.public.mkdir()
        self.data = self.root / 'data'
        self.data.mkdir()
        (self.data / 'plates.ts').write_text('unchanged')

    def tearDown(self):
        self.tmp.cleanup()

    def picture(self, file):
        file.parent.mkdir(parents=True, exist_ok=True)
        image = Image.new('RGB', (80, 40), 'white')
        ImageDraw.Draw(image).rectangle((0, 0, 40, 40), fill='black')
        image.save(file)

    def test_blank(self):
        file = self.public / 'blank.png'
        Image.new('RGB', (20, 20), 'white').save(file)
        with self.assertRaisesRegex(ValueError, '空白'):
            assets.inspect(self.public)

    def test_corrupt(self):
        (self.public / 'bad.png').write_bytes(b'broken')
        with self.assertRaises(ValueError):
            assets.inspect(self.public)

    def test_manual_image_is_manifested(self):
        self.picture(self.public / 'shots/manual/test.png')
        with patch.object(assets, 'PUBLIC', self.public), patch.object(assets, 'DATA', self.data):
            assets.collect_sizes()
            assets.write_plate_sizes()
        self.assertIn('"shots/manual/test.png": { width: 80, height: 40 }', (self.data / 'plates.ts').read_text())

    def test_missing_source_does_not_change_outputs(self):
        before = (self.data / 'plates.ts').read_bytes()
        with patch.object(assets, 'PUBLIC', self.public), patch.object(assets, 'DATA', self.data), patch.object(assets, 'PLATE_SOURCES', [('test', self.root, {'one':'missing.png'})]):
            with self.assertRaises(FileNotFoundError):
                assets.generate(Path('unused-browser'))
        self.assertEqual(before, (self.data / 'plates.ts').read_bytes())

    def test_generation_failure_preserves_outputs(self):
        self.picture(self.public / 'old.png')
        before = (self.public / 'old.png').read_bytes()
        with patch.object(assets, 'PUBLIC', self.public), patch.object(assets, 'DATA', self.data), patch.object(assets, 'RAW', self.root / 'raw'), patch.object(assets, 'PLATE_SOURCES', []), patch.object(assets, 'build_og', side_effect=RuntimeError('render failed')):
            with self.assertRaisesRegex(RuntimeError, 'render failed'):
                assets.generate(Path('unused-browser'))
        self.assertEqual(before, (self.public / 'old.png').read_bytes())
        self.assertEqual('unchanged', (self.data / 'plates.ts').read_text())

    def test_publish_rollback(self):
        old = self.public / 'old.png'
        old.write_bytes(b'original')
        new = self.root / 'new.png'
        new.write_bytes(b'new')
        with self.assertRaises(FileNotFoundError):
            assets.publish([(new, old), (self.root / 'missing', self.data / 'plates.ts')])
        self.assertEqual(b'original', old.read_bytes())
        self.assertEqual('unchanged', (self.data / 'plates.ts').read_text())


if __name__ == '__main__':
    unittest.main()
