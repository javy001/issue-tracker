-- Design doc v1.3: tasks no longer belong to a team; global task numbers (TSK-<n>); one team per user.
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_team_number_unique";--> statement-breakpoint
ALTER TABLE "teams" DROP CONSTRAINT "teams_next_task_number_positive";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_team_id_teams_id_fk";
--> statement-breakpoint
DROP INDEX "team_members_user_idx";--> statement-breakpoint
-- Per-team numbers repeat across teams: renumber globally by creation order before adding the identity.
UPDATE "tasks" SET "number" = renumbered.rn
FROM (SELECT "id", row_number() OVER (ORDER BY "created_at", "id") AS rn FROM "tasks") AS renumbered
WHERE "tasks"."id" = renumbered."id";--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "number" ADD GENERATED ALWAYS AS IDENTITY (sequence name "tasks_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);--> statement-breakpoint
-- Continue the sequence after the highest existing number.
SELECT setval('"tasks_number_seq"', COALESCE((SELECT max("number") FROM "tasks"), 0) + 1, false);--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "team_id";--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN "next_task_number";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_number_unique" UNIQUE("number");--> statement-breakpoint
-- One team per user: keep each user's earliest-created team membership.
DELETE FROM "team_members" AS tm
USING (
  SELECT m."team_id", m."user_id",
         row_number() OVER (PARTITION BY m."user_id" ORDER BY t."created_at", t."key") AS rn
  FROM "team_members" m JOIN "teams" t ON t."id" = m."team_id"
) AS ranked
WHERE tm."team_id" = ranked."team_id" AND tm."user_id" = ranked."user_id" AND ranked.rn > 1;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_unique" UNIQUE("user_id");
