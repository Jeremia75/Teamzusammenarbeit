// Aus dem Supabase-Schema erzeugt (generate_typescript_types).
// Bei Schemaänderungen neu erzeugen.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.18" };
  public: {
    Tables: {
      comments: {
        Row: { author_id: string; body: string; created_at: string; id: string; task_id: string };
        Insert: { author_id?: string; body: string; created_at?: string; id?: string; task_id: string };
        Update: { author_id?: string; body?: string; created_at?: string; id?: string; task_id?: string };
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
      notification_settings: {
        Row: { user_id: string; email_enabled: boolean; daily_mode: "off" | "digest" | "due"; on_assigned: boolean; asked_at: string | null; last_daily_on: string | null; updated_at: string };
        Insert: { user_id: string; email_enabled?: boolean; daily_mode?: "off" | "digest" | "due"; on_assigned?: boolean; asked_at?: string | null; updated_at?: string };
        Update: { email_enabled?: boolean; daily_mode?: "off" | "digest" | "due"; on_assigned?: boolean; asked_at?: string | null; updated_at?: string };
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
          completed_at: string | null; created_at: string; created_by: string | null; description: string; due_date: string | null;
          id: string; milestone_id: string | null; parent_id: string | null; position: number;
          priority: Database["public"]["Enums"]["task_priority"]; project_id: string;
          status: Database["public"]["Enums"]["task_status"]; title: string; updated_at: string;
          section_id: string | null; recurrence: Database["public"]["Enums"]["task_recurrence"] | null; recurrence_spawned: boolean;
        };
        Insert: {
          completed_at?: string | null; created_at?: string; created_by?: string | null; description?: string; due_date?: string | null;
          id?: string; milestone_id?: string | null; parent_id?: string | null; position?: number;
          priority?: Database["public"]["Enums"]["task_priority"]; project_id: string;
          status?: Database["public"]["Enums"]["task_status"]; title: string; updated_at?: string;
          section_id?: string | null; recurrence?: Database["public"]["Enums"]["task_recurrence"] | null; recurrence_spawned?: boolean;
        };
        Update: {
          completed_at?: string | null; created_at?: string; created_by?: string | null; description?: string; due_date?: string | null;
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
      sections: {
        Row: { created_at: string; id: string; name: string; position: number; project_id: string };
        Insert: { created_at?: string; id?: string; name: string; position?: number; project_id: string };
        Update: { created_at?: string; id?: string; name?: string; position?: number; project_id?: string };
        Relationships: [
          { foreignKeyName: "sections_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] },
        ];
      };
      workspace_members: {
        Row: { created_at: string; user_id: string; workspace_id: string };
        Insert: { created_at?: string; user_id: string; workspace_id: string };
        Update: { created_at?: string; user_id?: string; workspace_id?: string };
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
      add_member_by_email: { Args: { ws: string; member_email: string }; Returns: string };
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
export type TaskRecurrence = Database["public"]["Enums"]["task_recurrence"];
export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type TaskPriority = Database["public"]["Enums"]["task_priority"];