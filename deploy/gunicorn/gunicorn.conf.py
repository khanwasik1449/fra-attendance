"""
Production Gunicorn Configuration for FAMS
"""
import multiprocessing

bind = "127.0.0.1:8000"
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = "sync"
worker_connections = 1000
timeout = 60
keepalive = 5
max_requests = 2000
max_requests_jitter = 100

accesslog = "/var/log/gunicorn/fams-access.log"
errorlog = "/var/log/gunicorn/fams-error.log"
loglevel = "info"
capture_output = True
enable_stdio_inheritance = True
