"""
Network transport and background task for the plugin. Requests go through
QgsBlockingNetworkRequest so they use the proxy and SSL settings of QGIS.
"""
from qgis.PyQt.QtCore import QUrl, pyqtSignal
from qgis.PyQt.QtNetwork import QNetworkRequest
from qgis.core import QgsBlockingNetworkRequest, QgsFeedback, QgsTask

from .core.osm import USER_AGENT, Cancelled


class QgisHttp:
    """Same signature as core.osm.urllib_http. Cancelling `feedback` aborts
    the request in progress."""

    def __init__(self, feedback):
        self.feedback = feedback

    def __call__(self, url, data=None, timeout=60, is_cancelled=None):
        if self.feedback.isCanceled():
            raise Cancelled()
        request = QNetworkRequest(QUrl(url))
        request.setRawHeader(b'User-Agent', USER_AGENT.encode('utf-8'))
        if hasattr(request, 'setTransferTimeout'):
            request.setTransferTimeout(int(timeout * 1000))
        blocking = QgsBlockingNetworkRequest()
        if data is None:
            error = blocking.get(request, True, self.feedback)
        else:
            request.setHeader(QNetworkRequest.ContentTypeHeader,
                              'application/x-www-form-urlencoded; charset=UTF-8')
            error = blocking.post(request, data, True, self.feedback)
        if self.feedback.isCanceled():
            raise Cancelled()
        if error != QgsBlockingNetworkRequest.NoError:
            raise IOError(blocking.errorMessage())
        return bytes(blocking.reply().content())


class BackgroundTask(QgsTask):
    """Runs `work(http, is_cancelled, on_status)` off the main thread and calls
    `done(result, error)` on the main thread when it ends."""

    status = pyqtSignal(str)

    def __init__(self, description, work, done):
        super().__init__(description, QgsTask.CanCancel)
        self.work = work
        self.done = done
        self.feedback = QgsFeedback()
        self.result = None
        self.error = None

    def run(self):
        try:
            self.result = self.work(QgisHttp(self.feedback), self.isCanceled, self.status.emit)
            return True
        except Cancelled:
            return False
        except Exception as err:
            self.error = err
            return False

    def cancel(self):
        self.feedback.cancel()
        super().cancel()

    def finished(self, ok):
        if not ok and self.error is None and not self.isCanceled():
            self.error = RuntimeError('La tarea falló')
        self.done(self.result if ok else None, self.error)
