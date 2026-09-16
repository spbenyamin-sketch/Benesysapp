CREATE TABLE "server_license" (
	"id" integer PRIMARY KEY NOT NULL,
	"seed" text NOT NULL,
	"license" text,
	"last_seen" text,
	"installed_at" timestamp with time zone
);
