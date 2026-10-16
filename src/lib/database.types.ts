// Aus dem Supabase-Schema erzeugt (generate_typescript_types).
// Bei Schemaänderungen neu erzeugen.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.18" };
  public: {
    Tables: {
      comments: {
        Row: { author_id: string; body: string; created_at: string; id: string; task_id: string; mentions: string[] };
        Insert: { author_id?: string; body: string; created_at?: string; id?: string; task_id: string; mentions?: string[] };
        Update: { author_id?: string; body?: string; created_at?: string; id?: string; task_id?: string; mentions?: string[] };
        Relationships: [
          { foreignKeyName: "comments_task_id_fkey"; columns: ["task_id"]; isOneToOne: false; referencedRelation: "tasks"; referencedColumns: ["id"] },
        ];
      };
      goals: {
        Row: { created_at: string; description: string; id: string; project_id: string; target_date: string | null; title: string };
        Insert: { created_at?: string; description?: string; id?: string; project_id: string; target_date?: string | null; title: string };
        Update: { created_at?: string; description?: string; id?: string; project_id?: string; target_date?: string | null; title?: string };
        Relationships: [
          { foreignKeyName: "goals_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] },
        ];
      };
      milestones: {
        Row: { created_at: string; due_date: string | null; goal_id: string | null; id: string; name: string; position: number; project_id: string };
        Insert: { created_at?: string; due_date?: string | null; goal_id?: string | null; id?: string; name: string; position?: number; project_id: string };
        Update: { created_at?: string; due_date?: string | null; goal_id?: string | null; id?: string; name?: string; position?: number; project_id?: string };
        Relationships: [
          { foreignKeyName: "milestones_goal_id_fkey"; columns: ["goal_id"]; isOneToOne: false; referencedRelation: "goals"; referencedColumns: ["id"] },
          { foreignKeyName: "milestones_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] },
        ];
      };
      organization_members: {
        Row: { created_at: string; organization_id: string; role: Database["public"]["Enums"]["org_role"]; user_id: string };
        Insert: { created_at?: string; organization_id: string; role?: Database["public"]["Enums"]["org_role"]; user_id: string };
        Update: { created_at?: string; organization_id?: string; role?: Database["public"]["Enums"]["org_role"]; user_id?: string };
        Relationships: [
          { foreignKeyName: "organization_members_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
        ];
      };
      organizations: {
        Row: { created_at: string; created_by: string | null; id: string; is_personal: boolean; name: string };
        Insert: { created_at?: string; created_by?: string | null; id?: string; is_personal?: boolean; name: string };
        Update: { created_at?: string; created_by?: string | null; id?: string; is_personal?: boolean; name?: string };
        Relationships: [];
      };
      profiles: {
        Row: { avatar_color: string; created_at: string; display_name: string; id: string };
        Insert: { avatar_color?: string; created_at?: string; display_name?: string; id: string };
        Update: { avatar_color?: string; created_at?: string; display_name?: string; id?: string };
        Relationships: [];
      };
      appearance_settings: {
        Row: { user_id: string; settings: Json | null; image_path: string | null; updated_at: string };
        Insert: { user_id: string; settings?: Json | null; image_path?: string | null; updated_at?: string };
        Update: { settings?: Json | null; image_path?: string | null; updated_at?: string };
        Relationships: [];
      };
      project_templates: {
        Row: { id: string; workspace_id: string; name: string; description: string; data: Json; task_count: number; span_days: number | null; created_by: string | null; created_at: string; archived_at: string | null };
        Insert: { workspace_id: string; name: string; data: Json };
        Update: { name?: string };
        Relationships: [];
      };
      protocol_imports: {
        Row: {
          id: string; user_id: string; project_id: string | null; source: "text" | "file" | "mail"; title: string;
          status: "processing" | "ready" | "done" | "failed" | "dismissed"; error: string | null; summary: string | null;
          transcript: string | null; suggestions: Json; created_count: number; created_at: string; updated_at: string; new_project: Json | null;
        };
        Insert: { user_id: string; source: "text" | "file" | "mail"; project_id?: string | null; title?: string };
        Update: { project_id?: string | null; status?: "ready" | "done" | "dismissed"; suggestions?: Json; created_count?: number };
        Relationships: [];
      };
      app_settings: {
        Row: { key: string; value: string };
        Insert: { key: string; value: string };
        Update: { value?: string };
        Relationships: [];
      };
      project_members: {
        Row: { project_id: string; user_id: string; role: WorkspaceRole; added_by: string | null; created_at: string };
        Insert: { project_id: string; user_id: string; role?: WorkspaceRole };
        Update: { role?: WorkspaceRole };
        Relationships: [];
      };
      task_history: {
        Row: { id: number; task_id: string; actor_id: string | null; via_ai: boolean; field: string; old_value: string | null; new_value: string | null; created_at: string };
        Insert: { task_id: string; field: string; actor_id?: string | null; old_value?: string | null; new_value?: string | null };
        Update: { new_value?: string | null };
        Relationships: [];
      };
      notifications: {
        Row: { id: number; user_id: string; kind: "assigned" | "mention" | "comment" | "done" | "reminder"; task_id: string | null; actor_id: string | null; body: string | null; read_at: string | null; created_at: string };
        Insert: { user_id: string; kind: "assigned" | "mention" | "comment" | "done" | "reminder"; task_id?: string | null; actor_id?: string | null; body?: string | null };
        Update: { read_at?: string | null };
        Relationships: [
          { foreignKeyName: "notifications_task_id_fkey"; columns: ["task_id"]; isOneToOne: false; referencedRelation: "tasks"; referencedColumns: ["id"] },
        ];
      };
      task_dependencies: {
        Row: { task_id: string; depends_on: string; project_id: string; created_by: string | null; created_at: string };
        Insert: { task_id: string; depends_on: string; project_id: string };
        Update: { task_id?: string };
        Relationships: [
          { foreignKeyName: "task_dependencies_task_id_fkey"; columns: ["task_id"]; isOneToOne: false; referencedRelation: "tasks"; referencedColumns: ["id"] },
          { foreignKeyName: "task_dependencies_depends_on_fkey"; columns: ["depends_on"]; isOneToOne: false; referencedRelation: "tasks"; referencedColumns: ["id"] },
        ];
      };
      calendar_tokens: {
        Row: { user_id: string; token: string; created_at: string };
        Insert: { user_id?: string; token?: string };
        Update: { token?: string };
        Relationships: [];
      };
      task_attachments: {
        Row: { id: string; task_id: string; kind: "file" | "link"; name: string; url: string | null; storage_path: string | null; mime: string | null; size: number | null; created_by: string | null; created_at: string };
        Insert: { id?: string; task_id: string; kind: "file" | "link"; name: string; url?: string | null; storage_path?: string | null; mime?: string | null; size?: number | null; created_by?: string | null; created_at?: string };
        Update: { name?: string };
        Relationships: [
          { foreignKeyName: "task_attachments_task_id_fkey"; columns: ["task_id"]; isOneToOne: false; referencedRelation: "tasks"; referencedColumns: ["id"] },
        ];
      };
      notification_settings: {
        Row: { user_id: string; email_enabled: boolean; daily_mode: "off" | "digest" | "due"; on_assigned: boolean; on_mention: boolean; weekly_review: boolean; asked_at: string | null; last_daily_on: string | null; last_weekly_on: string | null; updated_at: string };
        Insert: { user_id: string; email_enabled?: boolean; daily_mode?: "off" | "digest" | "due"; on_assigned?: boolean; on_mention?: boolean; weekly_review?: boolean; asked_at?: string | null; updated_at?: string };
        Update: { email_enabled?: boolean; daily_mode?: "off" | "digest" | "due"; on_assigned?: boolean; on_mention?: boolean; weekly_review?: boolean; asked_at?: string | null; updated_at?: string };
        Relationships: [];
      };
      project_sections: {
        Row: { created_at: string; id: string; name: string; position: number; workspace_id: string };
        Insert: { created_at?: string; id?: string; name: string; position?: number; workspace_id: string };
        Update: { created_at?: string; id?: string; name?: string; position?: number; workspace_id?: string };
        Relationships: [
          { foreignKeyName: "project_sections_workspace_id_fkey"; columns: ["workspace_id"]; isOneToOne: false; referencedRelation: "workspaces"; referencedColumns: ["id"] },
        ];
      };
      projects: {
        Row: { archived_at: string | null; color: string; created_at: string; created_by: string | null; description: string; id: string; name: string; updated_at: string; workspace_id: string; section_id: string | null; position: number };
        Insert: { archived_at?: string | null; color?: string; created_at?: string; created_by?: string | null; description?: string; id?: string; name: string; updated_at?: string; workspace_id: string; section_id?: string | null; position?: number };
        Update: { archived_at?: string | null; color?: string; created_at?: string; created_by?: string | null; description?: string; id?: string; name?: string; updated_at?: string; workspace_id?: string; section_id?: string | null; position?: number };
        Relationships: [
          { foreignKeyName: "projects_workspace_id_fkey"; columns: ["workspace_id"]; isOneToOne: false; referencedRelation: "workspaces"; referencedColumns: ["id"] },
          { foreignKeyName: "projects_section_id_fkey"; columns: ["section_id"]; isOneToOne: false; referencedRelation: "project_sections"; referencedColumns: ["id"] },
        ];
      };
      task_assignees: {
        Row: { created_at: string; task_id: string; user_id: string };
        Insert: { created_at?: string; task_id: string; user_id: string };
        Update: { created_at?: string; task_id?: string; user_id?: string };
        Relationships: [
          { foreignKeyName: "task_assignees_task_id_fkey"; columns: ["task_id"]; isOneToOne: false; referencedRelation: "tasks"; referencedColumns: ["id"] },
        ];
      };
      tasks: {
        Row: {
          completed_at: string | null; created_at: string; created_by: string | null; description: string; due_date: string | null; start_date: string | null;
          id: string; milestone_id: string | null; parent_id: string | null; position: number;
          priority: Database["public"]["Enums"]["task_priority"]; project_id: string;
          status: Database["public"]["Enums"]["task_status"]; title: string; updated_at: string;
          section_id: string | null; recurrence: Database["public"]["Enums"]["task_recurrence"] | null; recurrence_spawned: boolean;
        };
        Insert: {
          completed_at?: string | null; created_at?: string; created_by?: string | null; description?: string; due_date?: string | null; start_date?: string | null;
          id?: string; milestone_id?: string | null; parent_id?: string | null; position?: number;
          priority?: Database["public"]["Enums"]["task_priority"]; project_id: string;
          status?: Database["public"]["Enums"]["task_status"]; title: string; updated_at?: string;
          section_id?: string | null; recurrence?: Database["public"]["Enums"]["task_recurrence"] | null; recurrence_spawned?: boolean;
        };
        Update: {
          completed_at?: string | null; created_at?: string; created_by?: string | null; description?: string; due_date?: string | null; start_date?: string | null;
          id?: string; milestone_id?: string | null; parent_id?: string | null; position?: number;
          priority?: Database["public"]["Enums"]["task_priority"]; project_id?: string;
          status?: Database["public"]["Enums"]["task_status"]; title?: string; updated_at?: string;
          section_id?: string | null; recurrence?: Database["public"]["Enums"]["task_recurrence"] | null; recurrence_spawned?: boolean;
        };
        Relationships: [
          { foreignKeyName: "tasks_milestone_id_fkey"; columns: ["milestone_id"]; isOneToOne: false; referencedRelation: "milestones"; referencedColumns: ["id"] },
          { foreignKeyName: "tasks_parent_id_fkey"; columns: ["parent_id"]; isOneToOne: false; referencedRelation: "tasks"; referencedColumns: ["id"] },
          { foreignKeyName: "tasks_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] },
          { foreignKeyName: "tasks_section_id_fkey"; columns: ["section_id"]; isOneToOne: false; referencedRelation: "sections"; referencedColumns: ["id"] },
        ];
      };
      task_reminders: {
        Row: { id: number; task_id: string; user_id: string; remind_at: string; sent_at: string | null; created_at: string };
        Insert: { task_id: string; user_id?: string; remind_at: string };
        Update: { remind_at?: string };
        Relationships: [];
      };
      sections: {
        Row: { created_at: string; id: string; name: string; position: number; project_id: string };
        Insert: { created_at?: string; id?: string; name: string; position?: number; project_id: string };
        Update: { created_at?: string; id?: string; name?: string; position?: number; project_id?: string };
        Relationships: [
          { foreignKeyName: "sections_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] },
        ];
      };
      workspace_members: {
        Row: { created_at: string; user_id: string; workspace_id: string; role: WorkspaceRole };
        Insert: { created_at?: string; user_id: string; workspace_id: string; role?: WorkspaceRole };
        Update: { created_at?: string; user_id?: string; workspace_id?: string; role?: WorkspaceRole };
        Relationships: [
          { foreignKeyName: "workspace_members_workspace_id_fkey"; columns: ["workspace_id"]; isOneToOne: false; referencedRelation: "workspaces"; referencedColumns: ["id"] },
        ];
      };
      workspaces: {
        Row: { color: string; created_at: string; id: string; name: string; organization_id: string };
        Insert: { color?: string; created_at?: string; id?: string; name: string; organization_id: string };
        Update: { color?: string; created_at?: string; id?: string; name?: string; organization_id?: string };
        Relationships: [
          { foreignKeyName: "workspaces_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      create_organization: { Args: { first_workspace?: string; org_name: string }; Returns: string };
      add_member_by_email: { Args: { ws: string; member_email: string; member_role?: WorkspaceRole }; Returns: string };
      report_error: { Args: { src: string; msg: string; detail?: string; page?: string; agent?: string }; Returns: undefined };
      save_project_template: { Args: { proj: string; tpl_name: string; tpl_description?: string }; Returns: string };
      create_project_from_template: { Args: { tpl: string; ws: string; proj_name: string; start_on?: string; section?: string | null }; Returns: string };
      update_project_template: { Args: { tpl: string; tpl_name: string; tpl_description: string; remove?: boolean }; Returns: undefined };
      add_project_guest: { Args: { proj: string; guest_email: string; guest_role: WorkspaceRole }; Returns: string };
      set_project_guest_role: { Args: { proj: string; guest: string; guest_role: WorkspaceRole }; Returns: undefined };
      remove_project_guest: { Args: { proj: string; guest: string }; Returns: undefined };
      set_member_role: { Args: { ws: string; member: string; member_role: WorkspaceRole }; Returns: undefined };
      trash_task: { Args: { t: string }; Returns: undefined };
      trash_project: { Args: { proj: string }; Returns: undefined };
      trash_restore: { Args: { k: string; item: string }; Returns: undefined };
      trash_purge: { Args: { k: string; item: string }; Returns: undefined };
      trash_files: { Args: { k: string; item: string }; Returns: { id: string; name: string; storage_path: string; size: number | null }[] };
      trash_list: {
        Args: Record<string, never>;
        Returns: {
          kind: "task" | "project"; id: string; title: string; project_id: string; project: string; workspace: string;
          deleted_at: string; deleted_by: string; task_count: number; file_count: number; can_purge: boolean;
        }[];
      };
      calendar_feed: {
        Args: { tok: string };
        Returns: { kind: string; id: string; title: string; start_date: string; end_date: string; project: string; project_id: string; status: string | null; description: string | null }[];
      };
    };
    Enums: {
      org_role: "owner" | "admin" | "member";
      task_priority: "low" | "medium" | "high";
      task_status: "todo" | "doing" | "review" | "done";
      task_recurrence: "daily" | "weekly" | "biweekly" | "monthly" | "yearly";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

type T = Database["public"]["Tables"];
export type Task = T["tasks"]["Row"];
export type Milestone = T["milestones"]["Row"];
export type Project = T["projects"]["Row"];
export type Profile = T["profiles"]["Row"];
export type Comment = T["comments"]["Row"];
export type Section = T["sections"]["Row"];
export type ProjectSection = T["project_sections"]["Row"];
export type NotificationSettings = T["notification_settings"]["Row"];
export type Attachment = T["task_attachments"]["Row"];
export type Notification = T["notifications"]["Row"];
export type ProtocolImport = T["protocol_imports"]["Row"];
/** Ein Aufgaben-Vorschlag aus einem Protokoll (siehe supabase/functions/protokoll/logic.ts) */
export type Suggestion = {
  key: string;
  selected: boolean;
  title: string;
  description: string;
  assignees: string[];
  unknown_people: string[];
  start_date: string | null;
  due_date: string | null;
  priority: TaskPriority;
  section_id: string | null;
  milestone_id: string | null;
  quote: string;
  duplicate_of: string | null;
};
export type HistoryEntry = T["task_history"]["Row"];
/** Rolle in einem Bereich: Bearbeiten, Kommentieren, Nur ansehen */
export type WorkspaceRole = "editor" | "commenter" | "viewer";
export type Dependency = { task_id: string; depends_on: string };
export type TaskRecurrence = Database["public"]["Enums"]["task_recurrence"];
export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type TaskPriority = Database["public"]["Enums"]["task_priority"];