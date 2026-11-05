"""A reviewed, authored explorable, assembled by Open Intelligent UI."""
from pathlib import Path

APP = Path(__file__).resolve().parent

def fragment() -> str:
    template = (APP / "templates/bicycle-guide.html").read_text("utf-8")
    bicycle = (APP / "web/assets/bicycle.svg").read_text("utf-8")
    return template.replace("__BICYCLE_SVG__", bicycle)
