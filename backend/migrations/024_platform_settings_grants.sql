DO $$
BEGIN
  IF to_regclass('public.platform_settings') IS NOT NULL THEN
    GRANT SELECT ON TABLE "platform_settings" TO app_lab_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "platform_settings" TO app_platform_admin;
  END IF;
END $$;
