"""py2app configuration for the native Hercules AI menu-bar app."""

from pathlib import Path

from setuptools import setup


APP = ["app.py"]
ICON_ASSET = Path(__file__).resolve().parent.parent / "desktop" / "src" / "assets" / "trayTemplate.svg"
OPTIONS = {
    "argv_emulation": False,
    "packages": ["objc"],
    "plist": {
        "CFBundleName": "Hercules AI",
        "CFBundleDisplayName": "Hercules AI",
        "LSUIElement": True,
        "NSHighResolutionCapable": True,
    },
    "resources": [str(ICON_ASSET)],
}

setup(
    app=APP,
    options={"py2app": OPTIONS},
    setup_requires=["py2app"],
)
