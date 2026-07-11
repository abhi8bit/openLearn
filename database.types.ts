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
      books: {
        Row: {
          created_at: string | null
          display_order: number | null
          exam_id: string
          id: string
          is_active: boolean | null
          name: string
          slug: string
          total_chapters: number | null
          total_questions: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          exam_id: string
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          total_chapters?: number | null
          total_questions?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          exam_id?: string
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          total_chapters?: number | null
          total_questions?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "books_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_concepts: {
        Row: {
          chapter_id: string
          content: string | null
          created_at: string | null
          display_order: number
          id: string
          title: string | null
          updated_at: string | null
        }
        Insert: {
          chapter_id: string
          content?: string | null
          created_at?: string | null
          display_order?: number
          id?: string
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          chapter_id?: string
          content?: string | null
          created_at?: string | null
          display_order?: number
          id?: string
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chapter_concepts_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      chapters: {
        Row: {
          book_id: string
          concept_count: number | null
          content_version: number | null
          created_at: string | null
          days_from: number | null
          days_to: number | null
          display_order: number | null
          id: string
          image_count: number | null
          is_active: boolean | null
          name: string
          page_end: number | null
          page_start: number | null
          question_count: number | null
          slug: string
          storage_prefix: string | null
          updated_at: string | null
        }
        Insert: {
          book_id: string
          concept_count?: number | null
          content_version?: number | null
          created_at?: string | null
          days_from?: number | null
          days_to?: number | null
          display_order?: number | null
          id?: string
          image_count?: number | null
          is_active?: boolean | null
          name: string
          page_end?: number | null
          page_start?: number | null
          question_count?: number | null
          slug: string
          storage_prefix?: string | null
          updated_at?: string | null
        }
        Update: {
          book_id?: string
          concept_count?: number | null
          content_version?: number | null
          created_at?: string | null
          days_from?: number | null
          days_to?: number | null
          display_order?: number | null
          id?: string
          image_count?: number | null
          is_active?: boolean | null
          name?: string
          page_end?: number | null
          page_start?: number | null
          question_count?: number | null
          slug?: string
          storage_prefix?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chapters_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          category_name: string | null
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name: string
          slug: string
          total_books: number | null
          total_chapters: number | null
          total_questions: number | null
          updated_at: string | null
        }
        Insert: {
          category_name?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          total_books?: number | null
          total_chapters?: number | null
          total_questions?: number | null
          updated_at?: string | null
        }
        Update: {
          category_name?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          total_books?: number | null
          total_chapters?: number | null
          total_questions?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      problem_reports: {
        Row: {
          book_id: string | null
          chapter_id: string | null
          created_at: string
          custom_type: string | null
          description: string
          device_id: string | null
          exam_id: string | null
          id: string
          problem_type: string
          question_id: string | null
          session_id: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          book_id?: string | null
          chapter_id?: string | null
          created_at?: string
          custom_type?: string | null
          description: string
          device_id?: string | null
          exam_id?: string | null
          id?: string
          problem_type: string
          question_id?: string | null
          session_id?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          book_id?: string | null
          chapter_id?: string | null
          created_at?: string
          custom_type?: string | null
          description?: string
          device_id?: string | null
          exam_id?: string | null
          id?: string
          problem_type?: string
          question_id?: string | null
          session_id?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "problem_reports_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "problem_reports_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "problem_reports_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "problem_reports_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_options: {
        Row: {
          created_at: string | null
          display_order: number
          id: string
          is_correct: boolean | null
          option_label: string
          option_text: string | null
          question_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number
          id?: string
          is_correct?: boolean | null
          option_label: string
          option_text?: string | null
          question_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number
          id?: string
          is_correct?: boolean | null
          option_label?: string
          option_text?: string | null
          question_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_solutions: {
        Row: {
          answer_source: string | null
          created_at: string | null
          id: string
          question_id: string
          solution_page: number | null
          solution_text: string | null
          updated_at: string | null
        }
        Insert: {
          answer_source?: string | null
          created_at?: string | null
          id?: string
          question_id: string
          solution_page?: number | null
          solution_text?: string | null
          updated_at?: string | null
        }
        Update: {
          answer_source?: string | null
          created_at?: string | null
          id?: string
          question_id?: string
          solution_page?: number | null
          solution_text?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_solutions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          category: string | null
          chapter_id: string
          created_at: string | null
          has_image: boolean | null
          id: string
          question_number: number
          question_page: number | null
          question_source: string | null
          question_text: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          chapter_id: string
          created_at?: string | null
          has_image?: boolean | null
          id?: string
          question_number: number
          question_page?: number | null
          question_source?: string | null
          question_text?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          chapter_id?: string
          created_at?: string | null
          has_image?: boolean | null
          id?: string
          question_number?: number
          question_page?: number | null
          question_source?: string | null
          question_text?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_questions: {
        Row: {
          device_id: string | null
          id: string
          question_id: string
          saved_at: string | null
          user_id: string | null
        }
        Insert: {
          device_id?: string | null
          id?: string
          question_id: string
          saved_at?: string | null
          user_id?: string | null
        }
        Update: {
          device_id?: string | null
          id?: string
          question_id?: string
          saved_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_answers: {
        Row: {
          answered_at: string | null
          created_at: string | null
          id: string
          is_correct: boolean | null
          is_marked: boolean | null
          question_id: string
          selected_option: string | null
          session_id: string
          time_spent_secs: number | null
          updated_at: string | null
        }
        Insert: {
          answered_at?: string | null
          created_at?: string | null
          id?: string
          is_correct?: boolean | null
          is_marked?: boolean | null
          question_id: string
          selected_option?: string | null
          session_id: string
          time_spent_secs?: number | null
          updated_at?: string | null
        }
        Update: {
          answered_at?: string | null
          created_at?: string | null
          id?: string
          is_correct?: boolean | null
          is_marked?: boolean | null
          question_id?: string
          selected_option?: string | null
          session_id?: string
          time_spent_secs?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_answers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "user_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          answered_count: number | null
          completed_at: string | null
          correct_count: number | null
          created_at: string | null
          current_index: number | null
          current_section_index: number | null
          device_id: string | null
          id: string
          is_active: boolean | null
          is_submitted: boolean | null
          question_ids: string[] | null
          scope: string
          scope_id: string | null
          section_time_elapsed_secs: number[] | null
          session_type: string
          settings: Json | null
          started_at: string | null
          submitted_at: string | null
          time_elapsed_secs: number | null
          time_limit_secs: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          answered_count?: number | null
          completed_at?: string | null
          correct_count?: number | null
          created_at?: string | null
          current_index?: number | null
          current_section_index?: number | null
          device_id?: string | null
          id?: string
          is_active?: boolean | null
          is_submitted?: boolean | null
          question_ids?: string[] | null
          scope: string
          scope_id?: string | null
          section_time_elapsed_secs?: number[] | null
          session_type: string
          settings?: Json | null
          started_at?: string | null
          submitted_at?: string | null
          time_elapsed_secs?: number | null
          time_limit_secs?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          answered_count?: number | null
          completed_at?: string | null
          correct_count?: number | null
          created_at?: string | null
          current_index?: number | null
          current_section_index?: number | null
          device_id?: string | null
          id?: string
          is_active?: boolean | null
          is_submitted?: boolean | null
          question_ids?: string[] | null
          scope?: string
          scope_id?: string | null
          section_time_elapsed_secs?: number[] | null
          session_type?: string
          settings?: Json | null
          started_at?: string | null
          submitted_at?: string | null
          time_elapsed_secs?: number | null
          time_limit_secs?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
