from rest_framework import serializers
from django.contrib.auth import authenticate
from rest_framework_simplejwt.tokens import RefreshToken
from .models import User, Department, Project, Employee
from django.db import transaction

class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ['id', 'name', 'code', 'is_active', 'created_at']


from .bangladesh_geo import get_district_center

class ProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = [
            'id', 'name', 'code', 'description',
            'division', 'district', 'upazila',
            'latitude', 'longitude', 'radius_meters',
            'is_active', 'created_at'
        ]

    def create(self, validated_data):
        district = validated_data.get('district')
        # If admin specified district but not coordinates, automatically resolve center coordinates
        if district and (validated_data.get('latitude') is None or validated_data.get('longitude') is None):
            lat, lon = get_district_center(district)
            if lat and lon:
                validated_data['latitude'] = lat
                validated_data['longitude'] = lon
        return super().create(validated_data)

    def update(self, instance, validated_data):
        district = validated_data.get('district', instance.district)
        if district and ('latitude' not in validated_data or validated_data.get('latitude') is None):
            lat, lon = get_district_center(district)
            if lat and lon:
                validated_data['latitude'] = lat
                validated_data['longitude'] = lon
        return super().update(instance, validated_data)


class UserMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'role', 'is_active']


class EmployeeSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source='department.name', read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    role = serializers.CharField(source='user.role', read_only=True)

    class Meta:
        model = Employee
        fields = [
            'id', 'employee_id', 'full_name', 'phone',
            'division', 'district', 'upazila',
            'department', 'department_name', 'project', 'project_name',
            'designation', 'joining_date', 'is_active', 'deactivated_at',
            'email', 'username', 'role', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'deactivated_at', 'created_at', 'updated_at']


from django.utils import timezone

class EmployeeCreateSerializer(serializers.ModelSerializer):
    username = serializers.CharField(write_only=True)
    password = serializers.CharField(write_only=True, min_length=6)
    email = serializers.EmailField(write_only=True, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=User.Role.choices, default=User.Role.FIELD_ASSISTANT, write_only=True)
    joining_date = serializers.DateField(required=False, default=timezone.localdate)

    class Meta:
        model = Employee
        fields = [
            'id', 'employee_id', 'full_name', 'phone',
            'division', 'district', 'upazila',
            'department', 'project', 'designation', 'joining_date',
            'username', 'password', 'email', 'role'
        ]

    def create(self, validated_data):
        username = validated_data.pop('username')
        password = validated_data.pop('password')
        email = validated_data.pop('email', '')
        role = validated_data.pop('role', User.Role.FIELD_ASSISTANT)

        # If project is selected but employee's district is blank, inherit from project
        proj = validated_data.get('project')
        if proj and not validated_data.get('district') and proj.district:
            validated_data['district'] = proj.district
            if not validated_data.get('division'):
                validated_data['division'] = proj.division
            if not validated_data.get('upazila'):
                validated_data['upazila'] = proj.upazila

        with transaction.atomic():
            user = User.objects.create_user(
                username=username,
                password=password,
                email=email,
                role=role
            )
            employee = Employee.objects.create(user=user, **validated_data)
        return employee


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        username = attrs.get('username')
        password = attrs.get('password')

        user = authenticate(username=username, password=password)
        if not user:
            raise serializers.ValidationError({"detail": "Invalid username or password."})

        if not user.is_active:
            raise serializers.ValidationError({"detail": "This account is inactive. Please contact an administrator."})

        refresh = RefreshToken.for_user(user)
        # Add custom claims
        refresh['role'] = user.role
        refresh['username'] = user.username

        employee_data = None
        if hasattr(user, 'employee_profile'):
            employee_data = EmployeeSerializer(user.employee_profile).data

        return {
            'refresh': str(refresh),
            'access': str(refresh.access_token),
            'user': UserMinimalSerializer(user).data,
            'employee': employee_data
        }
