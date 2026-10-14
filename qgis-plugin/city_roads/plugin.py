import os

from qgis.PyQt.QtGui import QIcon
from qgis.PyQt.QtWidgets import QAction


class CityRoadsPlugin:
    def __init__(self, iface):
        self.iface = iface
        self.action = None
        self.dialog = None

    def initGui(self):
        icon = QIcon(os.path.join(os.path.dirname(__file__), 'icon.png'))
        self.action = QAction(icon, 'City Roads: calles a KML', self.iface.mainWindow())
        self.action.triggered.connect(self.show_dialog)
        self.iface.addToolBarIcon(self.action)
        self.iface.addPluginToWebMenu('City Roads', self.action)

    def unload(self):
        if self.dialog:
            self.dialog.cancel_task()
            self.dialog.close()
            self.dialog = None
        self.iface.removePluginWebMenu('City Roads', self.action)
        self.iface.removeToolBarIcon(self.action)

    def show_dialog(self):
        if self.dialog is None:
            from .dialog import CityRoadsDialog
            self.dialog = CityRoadsDialog(self.iface)
        self.dialog.show()
        self.dialog.raise_()
        self.dialog.activateWindow()
