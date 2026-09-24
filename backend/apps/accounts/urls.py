from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import LoginView, CurrentUserView, EmployeeViewSet, DepartmentViewSet, ProjectViewSet, BangladeshGeoView

router = DefaultRouter()
router.register(r'employees', EmployeeViewSet, basename='employee')
router.register(r'departments', DepartmentViewSet, basename='department')
router.register(r'projects', ProjectViewSet, basename='project')

urlpatterns = [
    path('login/', LoginView.as_view(), name='auth_login'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('me/', CurrentUserView.as_view(), name='auth_me'),
    path('geo/', BangladeshGeoView.as_view(), name='bangladesh_geo'),
    path('', include(router.urls)),
]
