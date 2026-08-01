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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_users: {
        Row: {
          created_at: string
          id: string
          password_hash: string
          role: Database["public"]["Enums"]["admin_role"]
          store_id: string | null
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          password_hash: string
          role?: Database["public"]["Enums"]["admin_role"]
          store_id?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          password_hash?: string
          role?: Database["public"]["Enums"]["admin_role"]
          store_id?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_users_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      attendances: {
        Row: {
          amount: number | null
          closed_at: string | null
          created_at: string
          id: string
          notes: string | null
          reason_id: string | null
          reason_other_text: string | null
          sales_rep_id: string
          status: string
          store_id: string | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          closed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          reason_id?: string | null
          reason_other_text?: string | null
          sales_rep_id: string
          status?: string
          store_id?: string | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          closed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          reason_id?: string | null
          reason_other_text?: string | null
          sales_rep_id?: string
          status?: string
          store_id?: string | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendances_reason_id_fkey"
            columns: ["reason_id"]
            isOneToOne: false
            referencedRelation: "no_sale_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendances_sales_rep_id_fkey"
            columns: ["sales_rep_id"]
            isOneToOne: false
            referencedRelation: "sales_reps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendances_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_imports: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          commission_config: Json
          created_at: string
          id: string
          imported_by: string | null
          meta_amount: number
          month: number
          store_id: string
          updated_at: string
          year: number
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          commission_config?: Json
          created_at?: string
          id?: string
          imported_by?: string | null
          meta_amount?: number
          month: number
          store_id: string
          updated_at?: string
          year: number
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          commission_config?: Json
          created_at?: string
          id?: string
          imported_by?: string | null
          meta_amount?: number
          month?: number
          store_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "commission_imports_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rows: {
        Row: {
          bruto: number
          consentimentos: number
          created_at: string
          desc_pct: number
          desconto: number
          id: string
          import_id: string
          liquido: number
          nome: string
          pa: number
          pm: number
          tm: number
          uni: number
          vendas: number
          vendas_com: number
          vendas_sem: number
        }
        Insert: {
          bruto?: number
          consentimentos?: number
          created_at?: string
          desc_pct?: number
          desconto?: number
          id?: string
          import_id: string
          liquido?: number
          nome: string
          pa?: number
          pm?: number
          tm?: number
          uni?: number
          vendas?: number
          vendas_com?: number
          vendas_sem?: number
        }
        Update: {
          bruto?: number
          consentimentos?: number
          created_at?: string
          desc_pct?: number
          desconto?: number
          id?: string
          import_id?: string
          liquido?: number
          nome?: string
          pa?: number
          pm?: number
          tm?: number
          uni?: number
          vendas?: number
          vendas_com?: number
          vendas_sem?: number
        }
        Relationships: [
          {
            foreignKeyName: "commission_rows_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "commission_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      no_sale_reasons: {
        Row: {
          active: boolean
          created_at: string
          id: string
          is_other: boolean
          label: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          is_other?: boolean
          label: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          is_other?: boolean
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          username: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          username: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          username?: string
        }
        Relationships: []
      }
      promo_exports: {
        Row: {
          created_at: string
          csv_content: string
          discount: number
          file_name: string
          filters: Json
          id: string
          product_count: number
        }
        Insert: {
          created_at?: string
          csv_content: string
          discount: number
          file_name: string
          filters?: Json
          id?: string
          product_count: number
        }
        Update: {
          created_at?: string
          csv_content?: string
          discount?: number
          file_name?: string
          filters?: Json
          id?: string
          product_count?: number
        }
        Relationships: []
      }
      rep_breaks: {
        Row: {
          break_type: string
          ended_at: string | null
          id: string
          reason: string | null
          sales_rep_id: string
          started_at: string
          store_id: string | null
        }
        Insert: {
          break_type: string
          ended_at?: string | null
          id?: string
          reason?: string | null
          sales_rep_id: string
          started_at?: string
          store_id?: string | null
        }
        Update: {
          break_type?: string
          ended_at?: string | null
          id?: string
          reason?: string | null
          sales_rep_id?: string
          started_at?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rep_breaks_sales_rep_id_fkey"
            columns: ["sales_rep_id"]
            isOneToOne: false
            referencedRelation: "sales_reps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_breaks_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_reps: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          queue_position: number | null
          status: string
          store_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          queue_position?: number | null
          status?: string
          store_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          queue_position?: number | null
          status?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_reps_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          pin: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          pin: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          pin?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_create: {
        Args: {
          _actor: string
          _actor_password: string
          _password: string
          _role?: Database["public"]["Enums"]["admin_role"]
          _store_id?: string
          _username: string
        }
        Returns: string
      }
      admin_delete: {
        Args: { _actor: string; _actor_password: string; _id: string }
        Returns: undefined
      }
      admin_list: {
        Args: { _actor: string; _actor_password: string }
        Returns: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["admin_role"]
          store_id: string
          updated_at: string
          username: string
        }[]
      }
      admin_update: {
        Args: {
          _actor: string
          _actor_password: string
          _id: string
          _new_password: string
          _new_role?: Database["public"]["Enums"]["admin_role"]
          _new_store_id?: string
          _new_username: string
        }
        Returns: undefined
      }
      close_commission_import: {
        Args: { _actor: string; _actor_password: string; _import_id: string }
        Returns: undefined
      }
      delete_commission_import: {
        Args: { _actor: string; _actor_password: string; _import_id: string }
        Returns: undefined
      }
      get_commission_full: {
        Args: { _actor: string; _actor_password: string; _import_id: string }
        Returns: Json
      }
      get_commission_summary: {
        Args: { _actor: string; _actor_password: string; _import_id: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_commission_imports: {
        Args: { _actor: string; _actor_password: string }
        Returns: {
          closed_at: string
          closed_by: string
          id: string
          imported_by: string
          meta_amount: number
          month: number
          store_id: string
          store_name: string
          updated_at: string
          year: number
        }[]
      }
      reopen_commission_import: {
        Args: { _actor: string; _actor_password: string; _import_id: string }
        Returns: undefined
      }
      save_commission_import: {
        Args: {
          _actor: string
          _actor_password: string
          _config: Json
          _meta: number
          _month: number
          _rows: Json
          _store_id: string
          _year: number
        }
        Returns: string
      }
      send_to_end_of_queue: { Args: { _rep_id: string }; Returns: undefined }
      verify_admin: {
        Args: { _password: string; _username: string }
        Returns: boolean
      }
      verify_admin_user: {
        Args: { _password: string; _username: string }
        Returns: {
          id: string
          role: Database["public"]["Enums"]["admin_role"]
          store_id: string
          username: string
        }[]
      }
      verify_store_pin: {
        Args: { _pin: string; _store_id: string }
        Returns: boolean
      }
    }
    Enums: {
      admin_role: "admin" | "gerente"
      app_role: "admin" | "operator"
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
  public: {
    Enums: {
      admin_role: ["admin", "gerente"],
      app_role: ["admin", "operator"],
    },
  },
} as const
