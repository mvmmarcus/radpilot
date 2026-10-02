export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_generations: {
        Row: {
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          input: Json
          input_tokens: number | null
          kind: Database["public"]["Enums"]["ai_generation_kind"]
          latency_ms: number | null
          model: string
          outcome: Database["public"]["Enums"]["ai_generation_outcome"]
          output: Json | null
          output_tokens: number | null
          prompt_version: string
          provider: string
          report_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          input: Json
          input_tokens?: number | null
          kind: Database["public"]["Enums"]["ai_generation_kind"]
          latency_ms?: number | null
          model: string
          outcome?: Database["public"]["Enums"]["ai_generation_outcome"]
          output?: Json | null
          output_tokens?: number | null
          prompt_version: string
          provider: string
          report_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          input?: Json
          input_tokens?: number | null
          kind?: Database["public"]["Enums"]["ai_generation_kind"]
          latency_ms?: number | null
          model?: string
          outcome?: Database["public"]["Enums"]["ai_generation_outcome"]
          output?: Json | null
          output_tokens?: number | null
          prompt_version?: string
          provider?: string
          report_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_generations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generations_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string
          entity_id: string
          id: number
          payload: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity: string
          entity_id: string
          id?: never
          payload?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string
          id?: never
          payload?: Json
        }
        Relationships: []
      }
      copilot_issues: {
        Row: {
          category: string
          created_at: string
          id: string
          message: string
          report_id: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          rule_id: string | null
          severity: Database["public"]["Enums"]["copilot_issue_severity"]
          source: Database["public"]["Enums"]["copilot_issue_source"]
          span: Json | null
          suggested_fix: Json | null
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          message: string
          report_id: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string | null
          severity: Database["public"]["Enums"]["copilot_issue_severity"]
          source: Database["public"]["Enums"]["copilot_issue_source"]
          span?: Json | null
          suggested_fix?: Json | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          message?: string
          report_id?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string | null
          severity?: Database["public"]["Enums"]["copilot_issue_severity"]
          source?: Database["public"]["Enums"]["copilot_issue_source"]
          span?: Json | null
          suggested_fix?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "copilot_issues_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_issues_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          birth_date: string
          created_at: string
          full_name: string
          id: string
          mrn: string
          sex: Database["public"]["Enums"]["patient_sex"]
        }
        Insert: {
          birth_date: string
          created_at?: string
          full_name: string
          id?: string
          mrn: string
          sex: Database["public"]["Enums"]["patient_sex"]
        }
        Update: {
          birth_date?: string
          created_at?: string
          full_name?: string
          id?: string
          mrn?: string
          sex?: Database["public"]["Enums"]["patient_sex"]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      report_versions: {
        Row: {
          content: Json
          created_at: string
          created_by: string | null
          id: string
          report_id: string
          status: Database["public"]["Enums"]["report_status"]
          version: number
        }
        Insert: {
          content: Json
          created_at?: string
          created_by?: string | null
          id?: string
          report_id: string
          status: Database["public"]["Enums"]["report_status"]
          version: number
        }
        Update: {
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          report_id?: string
          status?: Database["public"]["Enums"]["report_status"]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_versions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          content: Json
          created_at: string
          created_by: string | null
          id: string
          is_critical: boolean
          signed_at: string | null
          signed_by: string | null
          status: Database["public"]["Enums"]["report_status"]
          study_id: string
          template_id: string
          updated_at: string
          version: number
        }
        Insert: {
          content: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_critical?: boolean
          signed_at?: string | null
          signed_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          study_id: string
          template_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_critical?: boolean
          signed_at?: string | null
          signed_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          study_id?: string
          template_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_signed_by_fkey"
            columns: ["signed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: true
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      studies: {
        Row: {
          accession: string
          assigned_to: string | null
          body_part: string
          created_at: string
          description: string
          dicom_path: string | null
          id: string
          indication: string
          modality: Database["public"]["Enums"]["modality"]
          patient_id: string
          priority: Database["public"]["Enums"]["study_priority"]
          status: Database["public"]["Enums"]["study_status"]
          study_date: string
          updated_at: string
        }
        Insert: {
          accession: string
          assigned_to?: string | null
          body_part: string
          created_at?: string
          description?: string
          dicom_path?: string | null
          id?: string
          indication?: string
          modality: Database["public"]["Enums"]["modality"]
          patient_id: string
          priority?: Database["public"]["Enums"]["study_priority"]
          status?: Database["public"]["Enums"]["study_status"]
          study_date?: string
          updated_at?: string
        }
        Update: {
          accession?: string
          assigned_to?: string | null
          body_part?: string
          created_at?: string
          description?: string
          dicom_path?: string | null
          id?: string
          indication?: string
          modality?: Database["public"]["Enums"]["modality"]
          patient_id?: string
          priority?: Database["public"]["Enums"]["study_priority"]
          status?: Database["public"]["Enums"]["study_status"]
          study_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "studies_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studies_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          body_part: string
          created_at: string
          id: string
          macros: Json
          modality: Database["public"]["Enums"]["modality"]
          name: string
          normal_text: Json
          sections: Json
          slug: string
          updated_at: string
        }
        Insert: {
          body_part: string
          created_at?: string
          id?: string
          macros?: Json
          modality: Database["public"]["Enums"]["modality"]
          name: string
          normal_text?: Json
          sections?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          body_part?: string
          created_at?: string
          id?: string
          macros?: Json
          modality?: Database["public"]["Enums"]["modality"]
          name?: string
          normal_text?: Json
          sections?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
      reset_demo_data: { Args: never; Returns: undefined }
      seed_demo_data: { Args: never; Returns: undefined }
    }
    Enums: {
      ai_generation_kind: "report_draft" | "copilot_review"
      ai_generation_outcome: "pending" | "accepted" | "edited" | "rejected" | "error"
      app_role: "radiologist" | "admin"
      copilot_issue_severity: "blocking" | "warning" | "info"
      copilot_issue_source: "rule" | "llm" | "guideline"
      modality: "CT" | "MR" | "CR" | "US" | "MG"
      patient_sex: "F" | "M" | "O" | "U"
      report_status: "draft" | "preliminary" | "final" | "amended"
      study_priority: "stat" | "urgent" | "routine"
      study_status: "unread" | "in_progress" | "preliminary" | "final"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      ai_generation_kind: ["report_draft", "copilot_review"],
      ai_generation_outcome: ["pending", "accepted", "edited", "rejected", "error"],
      app_role: ["radiologist", "admin"],
      copilot_issue_severity: ["blocking", "warning", "info"],
      copilot_issue_source: ["rule", "llm", "guideline"],
      modality: ["CT", "MR", "CR", "US", "MG"],
      patient_sex: ["F", "M", "O", "U"],
      report_status: ["draft", "preliminary", "final", "amended"],
      study_priority: ["stat", "urgent", "routine"],
      study_status: ["unread", "in_progress", "preliminary", "final"],
    },
  },
} as const
