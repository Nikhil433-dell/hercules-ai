"""Native macOS menu-bar client for Hercules AI.

This replaces Electron's tray/window shell with AppKit while keeping the
existing FastAPI backend as the source of news data.
"""

from __future__ import annotations

import json
import threading
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from Foundation import NSBundle, NSObject, NSUserDefaults
from AppKit import (
    NSAlert,
    NSApp,
    NSApplication,
    NSApplicationActivationPolicyAccessory,
    NSButton,
    NSColor,
    NSFont,
    NSImage,
    NSPopover,
    NSStatusBar,
    NSStatusItem,
    NSTextField,
    NSView,
    NSViewController,
    NSWorkspace,
)


API_BASE_URL = "http://localhost:8000"
SOURCE_ICON_PATH = Path(__file__).resolve().parent.parent / "desktop" / "src" / "assets" / "trayTemplate.svg"
PREFERENCES_KEY = "HerculesPreferences"
DEFAULT_CATEGORIES = ["technology", "business", "world", "sports"]
CATEGORY_LABELS = {
    "technology": "Tech",
    "business": "Finance",
    "world": "World",
    "sports": "Sports",
}


def fetch_summary(category: str) -> dict[str, Any]:
    """Fetch a cached/AI-generated summary from the existing backend."""
    query = urllib.parse.urlencode({"category": category})
    request = urllib.request.Request(
        f"{API_BASE_URL}/news/summary?{query}",
        headers={"Accept": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.loads(response.read().decode("utf-8"))


class NewsViewController(NSViewController):
    """Native popover content for the menu-bar client."""

    def initWithApp_(self, app: "HerculesMenuBarApp"):
        self = self.init()
        if self is not None:
            self.app = app
            self.selected_category = app.preferences["categories"][0]
            self.loading = False
        return self

    def loadView(self):
        self.view = NSView.alloc().initWithFrame_(((0, 0), (380, 600)))

        self.title_label = NSTextField.labelWithString_("Hercules AI")
        self.title_label.setFont_(NSFont.boldSystemFontOfSize_(18))
        self.title_label.setFrame_(((20, 552), (250, 28)))
        self.view.addSubview_(self.title_label)

        self.close_button = NSButton.alloc().initWithFrame_(((335, 554), (28, 24)))
        self.close_button.setTitle_("×")
        self.close_button.setBordered_(False)
        self.close_button.setTarget_(self)
        self.close_button.setAction_("closePopover:")
        self.view.addSubview_(self.close_button)

        self.category_buttons = []
        x = 20
        for category in self.app.preferences["categories"]:
            button = NSButton.alloc().initWithFrame_(((x, 515), (78, 26)))
            button.setTitle_(CATEGORY_LABELS.get(category, category.title()))
            button.setBezelStyle_(1)
            button.setTag_(self.app.preferences["categories"].index(category))
            button.setTarget_(self)
            button.setAction_("categoryClicked:")
            self.view.addSubview_(button)
            self.category_buttons.append(button)
            x += 84

        self.status_label = NSTextField.labelWithString_("Ready")
        self.status_label.setTextColor_(NSColor.secondaryLabelColor())
        self.status_label.setFrame_(((20, 485), (340, 20)))
        self.view.addSubview_(self.status_label)

        self.summary_field = NSTextField.alloc().initWithFrame_(((20, 75), (340, 395)))
        self.summary_field.setEditable_(False)
        self.summary_field.setSelectable_(True)
        self.summary_field.setBezeled_(False)
        self.summary_field.setDrawsBackground_(False)
        self.summary_field.setFont_(NSFont.systemFontOfSize_(13))
        self.summary_field.setUsesSingleLineMode_(False)
        self.summary_field.setLineBreakMode_(0)
        self.summary_field.setMaximumNumberOfLines_(0)
        self.view.addSubview_(self.summary_field)

        self.refresh_button = NSButton.alloc().initWithFrame_(((20, 25), (100, 30)))
        self.refresh_button.setTitle_("Refresh")
        self.refresh_button.setTarget_(self)
        self.refresh_button.setAction_("refreshClicked:")
        self.view.addSubview_(self.refresh_button)

        self.preferences_button = NSButton.alloc().initWithFrame_(((270, 25), (90, 30)))
        self.preferences_button.setTitle_("Settings")
        self.preferences_button.setTarget_(self)
        self.preferences_button.setAction_("settingsClicked:")
        self.view.addSubview_(self.preferences_button)

    def viewDidAppear(self):
        self.refreshClicked_(None)

    def closePopover_(self, _sender):
        self.app.popover.close()

    def categoryClicked_(self, sender):
        categories = self.app.preferences["categories"]
        self.selected_category = categories[sender.tag()]
        self.refreshClicked_(sender)

    def refreshClicked_(self, _sender):
        if self.loading:
            return
        self.loading = True
        self.refresh_button.setEnabled_(False)
        self.status_label.setStringValue_("Loading...")
        self.summary_field.setStringValue_("")
        threading.Thread(target=self._load_summary, daemon=True).start()

    def _load_summary(self):
        try:
            payload = fetch_summary(self.selected_category)
            briefing = payload.get("briefing", {})
            articles = briefing.get("articles", [])
            lines = [briefing.get("summary", "No summary available."), ""]
            for article in articles:
                lines.append(f"• {article.get('title', '')}")
                lines.append(article.get("summary", ""))
                lines.append("")
            result = "\n".join(lines)
            status = f"{len(articles)} stories · {self.selected_category}"
        except Exception as error:
            result = (
                "The Hercules backend is unavailable.\n\n"
                "Start it with:\n"
                "cd backend && uvicorn app.main:app --reload"
            )
            status = f"Unable to refresh: {error}"

        self.performSelectorOnMainThread_withObject_waitUntilDone_(
            "applySummary_",
            (result, status),
            False,
        )

    def applySummary_(self, result):
        text, status = result
        self.summary_field.setStringValue_(text)
        self.status_label.setStringValue_(status)
        self.refresh_button.setEnabled_(True)
        self.loading = False

    def settingsClicked_(self, _sender):
        alert = NSAlert.alloc().init()
        alert.setMessageText_("Hercules AI Settings")
        alert.setInformativeText_(
            "Preferences are stored in macOS user defaults. "
            "Edit the categories in the native client configuration."
        )
        alert.addButtonWithTitle_("OK")
        alert.runModal()


class HerculesMenuBarApp(NSObject):
    """Owns the status item, popover, preferences, and wake observer."""

    def applicationDidFinishLaunching_(self, _notification):
        self.preferences = self.load_preferences()
        self.status_item: NSStatusItem = NSStatusBar.systemStatusBar().statusItemWithLength_(-1)
        self.status_item.button().setImage_(self.menu_icon())
        self.status_item.button().setToolTip_("Hercules AI")
        self.status_item.button().setTarget_(self)
        self.status_item.button().setAction_("togglePopover:")

        self.popover = NSPopover.alloc().init()
        self.popover.setBehavior_(1)
        self.popover.setAnimates_(True)
        self.view_controller = NewsViewController.alloc().initWithApp_(self)
        self.popover.setContentViewController_(self.view_controller)
        self.popover.setContentSize_((380, 600))

        workspace_center = NSWorkspace.sharedWorkspace().notificationCenter()
        workspace_center.addObserver_selector_name_object_(
            self,
            "systemWake:",
            "NSWorkspaceDidWakeNotification",
            None,
        )
        workspace_center.addObserver_selector_name_object_(
            self,
            "systemWake:",
            "NSWorkspaceScreensDidWakeNotification",
            None,
        )

    def menu_icon(self):
        resource_path = NSBundle.mainBundle().resourcePath()
        packaged_icon_paths = (
            [
                Path(str(resource_path)) / "trayTemplate.svg",
                Path(str(resource_path)) / "assets" / "trayTemplate.svg",
            ]
            if resource_path
            else []
        )
        icon_path = next(
            (candidate for candidate in packaged_icon_paths if candidate.exists()),
            SOURCE_ICON_PATH,
        )
        image = NSImage.alloc().initWithContentsOfFile_(str(icon_path))
        if image is None:
            image = NSImage.imageNamed_("NSInfo")
        if image is None:
            image = NSImage.alloc().initWithSize_((18, 18))
        image.setSize_((18, 18))
        image.setTemplate_(True)
        return image

    def togglePopover_(self, _sender):
        if self.popover.isShown():
            self.popover.close()
            return
        button = self.status_item.button()
        self.popover.showRelativeToRect_ofView_preferredEdge_(
            button.bounds(),
            button,
            3,
        )
        NSApp.activateIgnoringOtherApps_(True)

    def systemWake_(self, _notification):
        if self.popover.isShown():
            self.view_controller.refreshClicked_(None)

    def load_preferences(self):
        defaults = NSUserDefaults.standardUserDefaults()
        saved = defaults.objectForKey_(PREFERENCES_KEY)
        if isinstance(saved, dict):
            categories = saved.get("categories")
            if isinstance(categories, list) and categories:
                return {"categories": categories}
        return {"categories": DEFAULT_CATEGORIES.copy()}


def main():
    app = NSApplication.sharedApplication()
    app.setActivationPolicy_(NSApplicationActivationPolicyAccessory)
    delegate = HerculesMenuBarApp.alloc().init()
    app.setDelegate_(delegate)
    app.run()


if __name__ == "__main__":
    main()
