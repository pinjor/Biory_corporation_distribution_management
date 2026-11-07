from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    database_url: str = "postgresql://biory_app:biory_app@localhost:5432/biory"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret: str = "dev-only-change-me-please-32chars"
    file_token_secret: str = ""
    access_token_minutes: int = 15
    refresh_token_days: int = 14
    cors_origins: str = "http://localhost:3000,http://localhost"
    public_app_url: str = "http://localhost:3000"
    upload_dir: str = "./data/uploads"
    allow_signup: bool = True
    bootstrap_admin_email: str = ""
    bootstrap_admin_password: str = ""
    bootstrap_admin_name: str = "Super Admin"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "noreply@biory.local"
    smtp_tls: bool = True
    max_upload_bytes: int = 8 * 1024 * 1024

    @property
    def file_secret(self) -> str:
        return self.file_token_secret or self.jwt_secret

    @property
    def origins(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def production(self) -> bool:
        return self.environment.lower() == "production"


settings = Settings()
