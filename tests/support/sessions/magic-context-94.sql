-- Magic Context store format 94 (@cortexkit/opencode-magic-context 0.45.0): the tables a session sync reads or writes,

-- exactly as the plugin creates them (read from a live store with `select sql from sqlite_master`). Test fixture only.

CREATE TABLE schema_migrations (
			version INTEGER PRIMARY KEY,
			description TEXT NOT NULL,
			applied_at INTEGER NOT NULL
		);

CREATE TABLE compartments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      start_message INTEGER NOT NULL,
      end_message INTEGER NOT NULL,
      start_message_id TEXT DEFAULT '',
      end_message_id TEXT DEFAULT '',
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      p1 TEXT,
      p2 TEXT,
      p3 TEXT,
      p4 TEXT,
      importance INTEGER NOT NULL DEFAULT 50,
      episode_type TEXT,
      p1_embedding BLOB,
      p1_embedding_model_id TEXT,
      legacy INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      harness TEXT NOT NULL DEFAULT 'opencode', rebase_status TEXT NOT NULL DEFAULT 'ok', start_block_index INTEGER, end_block_index INTEGER,
      UNIQUE(session_id, sequence)
    );

CREATE INDEX idx_compartments_session ON compartments(session_id);

CREATE TABLE "compartment_chunk_embeddings" (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        compartment_id INTEGER NOT NULL REFERENCES compartments(id) ON DELETE CASCADE,
                        session_id TEXT NOT NULL,
                        project_path TEXT NOT NULL,
                        harness TEXT NOT NULL DEFAULT 'opencode',
                        window_index INTEGER NOT NULL DEFAULT 0,
                        start_ordinal INTEGER NOT NULL,
                        end_ordinal INTEGER NOT NULL,
                        chunk_hash TEXT NOT NULL,
                        model_id TEXT NOT NULL,
                        dims INTEGER NOT NULL,
                        vector BLOB NOT NULL,
                        created_at INTEGER NOT NULL,
                        UNIQUE(compartment_id, model_id, window_index)
                    );

CREATE INDEX idx_cce_session ON compartment_chunk_embeddings(session_id);

CREATE INDEX idx_cce_project_model ON compartment_chunk_embeddings(project_path, model_id);

CREATE TABLE tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      message_id TEXT,
      type TEXT,
      status TEXT DEFAULT 'active',
      byte_size INTEGER,
      tag_number INTEGER,
      harness TEXT NOT NULL DEFAULT 'opencode',
      entry_fingerprint TEXT,
      token_count INTEGER,
      input_token_count INTEGER,
      reasoning_token_count INTEGER, reasoning_byte_size INTEGER DEFAULT 0, drop_mode TEXT DEFAULT 'full', tool_name TEXT, input_byte_size INTEGER DEFAULT 0, caveman_depth INTEGER DEFAULT 0, tool_owner_message_id TEXT DEFAULT NULL,
      UNIQUE(session_id, tag_number)
    );

CREATE INDEX idx_tags_session_tag_number ON tags(session_id, tag_number);

CREATE INDEX idx_tags_session_message_id ON tags(session_id, message_id);

CREATE INDEX idx_tags_pi_adopt
            ON tags(session_id, entry_fingerprint)
            WHERE type='message' AND entry_fingerprint IS NOT NULL;

CREATE INDEX idx_tags_pi_fallback_tool_owner
            ON tags(session_id, tool_owner_message_id)
            WHERE type='tool';

CREATE INDEX idx_tags_active_session_tag_number
                ON tags(session_id, tag_number)
                WHERE status = 'active';

CREATE INDEX idx_tags_dropped_session_tag_number
                ON tags(session_id, tag_number)
                WHERE status = 'dropped';

CREATE UNIQUE INDEX idx_tags_tool_composite
                ON tags(session_id, message_id, tool_owner_message_id)
                WHERE type = 'tool' AND tool_owner_message_id IS NOT NULL;

CREATE INDEX idx_tags_tool_null_owner
                ON tags(session_id, message_id)
                WHERE type = 'tool' AND tool_owner_message_id IS NULL;

CREATE TABLE source_contents (
      tag_id INTEGER,
      session_id TEXT,
      content TEXT,
      created_at INTEGER,
      harness TEXT NOT NULL DEFAULT 'opencode',
      PRIMARY KEY(session_id, tag_id)
    );

CREATE INDEX idx_source_contents_session ON source_contents(session_id);

CREATE TABLE pending_ops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      tag_id INTEGER,
      operation TEXT,
      queued_at INTEGER,
      harness TEXT NOT NULL DEFAULT 'opencode'
    );

CREATE INDEX idx_pending_ops_session ON pending_ops(session_id);

CREATE INDEX idx_pending_ops_session_tag_id ON pending_ops(session_id, tag_id);

CREATE TABLE session_facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      harness TEXT NOT NULL DEFAULT 'opencode'
    );

CREATE INDEX idx_session_facts_session ON session_facts(session_id);

CREATE TABLE compression_depth (
      session_id TEXT NOT NULL,
      message_ordinal INTEGER NOT NULL,
      depth INTEGER NOT NULL DEFAULT 0,
      harness TEXT NOT NULL DEFAULT 'opencode',
      PRIMARY KEY(session_id, message_ordinal)
    );

CREATE INDEX idx_compression_depth_session ON compression_depth(session_id);

CREATE TABLE notes (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					type TEXT NOT NULL DEFAULT 'session',
					status TEXT NOT NULL DEFAULT 'active',
					content TEXT NOT NULL,
					session_id TEXT,
					project_path TEXT,
					surface_condition TEXT,
					created_at INTEGER NOT NULL,
					updated_at INTEGER NOT NULL,
					last_checked_at INTEGER,
					ready_at INTEGER,
					ready_reason TEXT,
					compiled_provider TEXT,
					compiled_config TEXT,
					compiled_at INTEGER,
					compile_status TEXT CHECK(compile_status IN ('compiled', 'plain', 'refused'))
				, harness TEXT NOT NULL DEFAULT 'opencode', anchor_ordinal INTEGER, compiled_check TEXT, manifest_json TEXT, check_hash TEXT, check_cron TEXT, check_version INTEGER NOT NULL DEFAULT 0, check_status TEXT NOT NULL DEFAULT 'uncompiled', check_failure_count INTEGER NOT NULL DEFAULT 0, check_network_failure_count INTEGER NOT NULL DEFAULT 0, check_quarantined_until INTEGER, check_next_due_at INTEGER, check_compiled_at INTEGER, check_false_since_at INTEGER, check_last_liveness_at INTEGER, policy_version INTEGER NOT NULL DEFAULT 1, anchor_block_id TEXT);

CREATE INDEX idx_notes_session_status ON notes(session_id, status);

CREATE INDEX idx_notes_project_status ON notes(project_path, status);

CREATE INDEX idx_notes_type_status ON notes(type, status);

CREATE INDEX idx_notes_smart_checks_due
                    ON notes(project_path, check_status, check_next_due_at)
                    WHERE type = 'smart' AND status = 'pending';

CREATE INDEX idx_notes_smart_checks_liveness
                    ON notes(project_path, check_false_since_at, check_last_liveness_at)
                    WHERE type = 'smart' AND status = 'pending';

CREATE TABLE compartment_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      compartment_id INTEGER,
      kind TEXT NOT NULL,
      at_compartment INTEGER,
      fields_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      harness TEXT NOT NULL DEFAULT 'opencode'
    );

CREATE INDEX idx_compartment_events_session
      ON compartment_events(session_id);

CREATE TABLE compartment_state_lease (
      session_id TEXT PRIMARY KEY NOT NULL,
      holder_id TEXT NOT NULL,
      acquired_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    , owner_pid INTEGER);

CREATE INDEX idx_compartment_state_lease_expires
      ON compartment_state_lease(expires_at);

CREATE TABLE recomp_compartments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      start_message INTEGER NOT NULL,
      end_message INTEGER NOT NULL,
      start_message_id TEXT DEFAULT '',
      end_message_id TEXT DEFAULT '',
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      p1 TEXT,
      p2 TEXT,
      p3 TEXT,
      p4 TEXT,
      importance INTEGER NOT NULL DEFAULT 50,
      episode_type TEXT,
      pass_number INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      harness TEXT NOT NULL DEFAULT 'opencode', rebase_status TEXT NOT NULL DEFAULT 'ok', start_block_index INTEGER, end_block_index INTEGER,
      UNIQUE(session_id, sequence)
    );

CREATE INDEX idx_recomp_compartments_session ON recomp_compartments(session_id);

CREATE TABLE recomp_facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      pass_number INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      harness TEXT NOT NULL DEFAULT 'opencode'
    );

CREATE INDEX idx_recomp_facts_session ON recomp_facts(session_id);

CREATE TABLE "lkg_slots" (
            session_id TEXT PRIMARY KEY,
            json_prefix_chars INTEGER NOT NULL,
            json_prefix_chunks INTEGER NOT NULL,
            json_prefix_hash TEXT NOT NULL,
            input_id_seq TEXT NOT NULL,
            input_content_digests TEXT NOT NULL,
            input_content_signatures TEXT,
            last_input_message_id TEXT NOT NULL,
            model_key TEXT,
            provider_key TEXT,
            captured_at INTEGER NOT NULL,
            row_version INTEGER,
            capture_sequence INTEGER
        );

CREATE TABLE lkg_slot_chunks (
        session_id TEXT NOT NULL,
        chunk INTEGER NOT NULL,
        hash TEXT NOT NULL,
        body TEXT NOT NULL,
        PRIMARY KEY (session_id, chunk)
    );

CREATE TABLE session_meta (
      session_id TEXT PRIMARY KEY,
      harness TEXT NOT NULL DEFAULT 'opencode',
      last_response_time INTEGER,
      cache_ttl TEXT,
      counter INTEGER DEFAULT 0,
      last_nudge_tokens INTEGER DEFAULT 0,
      last_nudge_band TEXT DEFAULT '',
      last_nudge_undropped INTEGER DEFAULT 0,
      last_nudge_level TEXT DEFAULT '',
      channel2_nudge_state TEXT DEFAULT '',
      channel2_nudge_claimed_at INTEGER DEFAULT 0,
      channel2_nudge_claim_token TEXT DEFAULT '',
      last_emergency_input_sample INTEGER DEFAULT 0,
      last_transform_error TEXT DEFAULT '',
      nudge_anchor_message_id TEXT DEFAULT '',
      nudge_anchor_text TEXT DEFAULT '',
      sticky_turn_reminder_text TEXT DEFAULT '',
      sticky_turn_reminder_message_id TEXT DEFAULT '',
      note_nudge_trigger_pending INTEGER DEFAULT 0,
      note_nudge_trigger_message_id TEXT DEFAULT '',
      note_nudge_sticky_text TEXT DEFAULT '',
      note_nudge_sticky_message_id TEXT DEFAULT '',
      note_nudge_anchors TEXT NOT NULL DEFAULT '[]',
      auto_search_hint_decisions TEXT NOT NULL DEFAULT '[]',
      last_todo_state TEXT DEFAULT '',
      todo_permission_denied INTEGER NOT NULL DEFAULT 2,
      todo_synthetic_call_id TEXT DEFAULT '',
      todo_synthetic_anchor_message_id TEXT DEFAULT '',
      todo_synthetic_state_json TEXT DEFAULT '',
      is_subagent INTEGER DEFAULT 0,
      last_context_percentage REAL DEFAULT 0,
      last_input_tokens INTEGER DEFAULT 0,
      detected_context_limit_provenance TEXT NOT NULL DEFAULT 'unknown',
      observed_safe_input_tokens INTEGER NOT NULL DEFAULT 0,
      cache_alert_sent INTEGER NOT NULL DEFAULT 0,
      times_execute_threshold_reached INTEGER DEFAULT 0,
      compartment_in_progress INTEGER DEFAULT 0,
      historian_failure_count INTEGER DEFAULT 0,
      historian_last_error TEXT DEFAULT NULL,
      historian_last_failure_at INTEGER DEFAULT NULL,
      system_prompt_hash TEXT DEFAULT '',
      memory_block_cache TEXT DEFAULT '',
      memory_block_count INTEGER DEFAULT 0,
      memory_block_ids TEXT DEFAULT '',
      -- pending_compaction_marker_state: intentionally NULLABLE without a
      -- default. Absence of a deferred marker is SQL NULL; presence is a
      -- valid JSON blob written via setPendingCompactionMarkerState.
      -- Excluded from the healAllNullColumns fallback list. Readers filter
      -- IS NOT NULL AND != empty-string defensively. Plan v6 section 3.
      pending_compaction_marker_state TEXT,
      -- Target OpenCode message id used to inject the current compaction marker.
      -- Nullable for legacy persisted markers; repaired on the next marker move.
      compaction_marker_target_end_message_id TEXT,
      -- pending_pi_compaction_marker_state: intentionally NULLABLE without a
      -- default. Absence of a deferred Pi-native marker is SQL NULL; presence
      -- is a valid JSON blob written via setPendingPiCompactionMarkerState.
      -- Excluded from the healAllNullColumns fallback list.
      pending_pi_compaction_marker_state TEXT,
      new_work_tokens INTEGER NOT NULL DEFAULT 0,
      total_input_tokens INTEGER NOT NULL DEFAULT 0,
      -- deferred_execute_state: intentionally NULLABLE without a default.
      -- Absence is SQL NULL; presence is a JSON blob written via
      -- setDeferredExecutePendingIfAbsent. Excluded from the
      -- healAllNullColumns fallback list.
      deferred_execute_state TEXT,
      cached_m0_bytes BLOB,
      cached_m0_project_memory_epoch INTEGER,
      cached_m0_workspace_fingerprint TEXT,
      cached_m0_project_user_profile_version INTEGER,
      cached_m0_max_compartment_seq INTEGER,
      cached_m0_max_memory_id INTEGER,
      cached_m0_max_mutation_id INTEGER,
      cached_m0_max_memory_mutation_id INTEGER,
      cached_m0_project_docs_hash TEXT,
      cached_m1_bytes BLOB,
      last_observed_model_key TEXT,
      last_usage_context_limit INTEGER NOT NULL DEFAULT 0,
      prior_boundary_ordinal INTEGER NOT NULL DEFAULT 1,
      protected_tail_policy_version INTEGER NOT NULL DEFAULT 0,
      protected_tail_drain_window_started_at INTEGER NOT NULL DEFAULT 0,
      protected_tail_drain_tokens INTEGER NOT NULL DEFAULT 0,
      recovery_no_eligible_head_count INTEGER NOT NULL DEFAULT 0,
      force_emergency_bypass_window_start INTEGER NOT NULL DEFAULT 0,
      force_emergency_bypass_used INTEGER NOT NULL DEFAULT 0,
      emergency_drain_active INTEGER NOT NULL DEFAULT 0,
      historian_drain_failure_at INTEGER NOT NULL DEFAULT 0,
      wrapup_in_progress_state TEXT,
      compaction_mode_record TEXT,
      cached_m0_materialized_at INTEGER,
      cached_m0_session_facts_version INTEGER,
      cached_m0_upgrade_state TEXT,
      cached_m0_system_hash TEXT,
      cached_m0_tool_set_hash TEXT,
      cached_m0_model_key TEXT,
      cached_m0_project_identity TEXT,
      cached_m0_last_baseline_end_message_id TEXT,
       upgrade_reminded_at INTEGER,
       pi_stable_id_scheme INTEGER
    , note_last_read_at INTEGER DEFAULT 0, cleared_reasoning_through_tag INTEGER DEFAULT 0, tool_reclaim_watermark INTEGER DEFAULT 0, stripped_placeholder_ids TEXT DEFAULT '', stale_reduce_stripped_ids TEXT DEFAULT '', processed_image_stripped_ids TEXT DEFAULT '', merged_reasoning_stripped_ids TEXT DEFAULT '', trailing_blank_decisions TEXT DEFAULT '', system_prompt_tokens INTEGER DEFAULT 0, compaction_marker_state TEXT DEFAULT '', key_files TEXT DEFAULT '', conversation_tokens INTEGER DEFAULT 0, tool_call_tokens INTEGER DEFAULT 0, recomp_partial_range_start INTEGER DEFAULT 0, recomp_partial_range_end INTEGER DEFAULT 0, detected_context_limit INTEGER DEFAULT 0, detected_context_limit_model_key TEXT, needs_emergency_recovery INTEGER DEFAULT 0, emergency_recovery_origin TEXT DEFAULT '', upgrade_reminder_last_sent_at INTEGER, upgrade_reminder_count INTEGER NOT NULL DEFAULT 0, cached_m0_mural_data_url TEXT, cached_m0_mural_hash TEXT, thinking_binding_recovery_target TEXT DEFAULT '', protected_tokens_effective INTEGER, protected_tokens_pre_snapshot TEXT, tags_version INTEGER NOT NULL DEFAULT 0, coordinate_generation TEXT, coordinate_rebase_notice TEXT);

CREATE TABLE session_projects (
      session_id TEXT NOT NULL,
      harness TEXT NOT NULL DEFAULT 'opencode',
      project_path TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(session_id, harness)
    );

CREATE INDEX idx_session_projects_project
      ON session_projects(project_path);

CREATE TABLE compartment_history_versions (
            session_id TEXT PRIMARY KEY NOT NULL,
            generation TEXT NOT NULL DEFAULT (lower(hex(randomblob(16)))),
            version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
            rewrite_version INTEGER NOT NULL DEFAULT 0 CHECK (rewrite_version >= 0),
            seeded INTEGER NOT NULL DEFAULT 0 CHECK (seeded IN (0, 1))
        );

CREATE TABLE memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_path TEXT NOT NULL,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      normalized_hash TEXT NOT NULL,
      importance INTEGER,
      scope TEXT NOT NULL DEFAULT 'project',
      shareable INTEGER NOT NULL DEFAULT 0,
      source_session_id TEXT,
      source_type TEXT DEFAULT 'historian',
      seen_count INTEGER DEFAULT 1,
      retrieval_count INTEGER DEFAULT 0,
      first_seen_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      last_retrieved_at INTEGER,
      status TEXT DEFAULT 'active',
      expires_at INTEGER,
      verification_status TEXT DEFAULT 'unverified',
      verified_at INTEGER,
      classified_at INTEGER,
      superseded_by_memory_id INTEGER,
      merged_from TEXT,
      metadata_json TEXT,
      mural_cue TEXT,
      mural_cue_hash TEXT,
      mural_cue_at INTEGER,
      mural_cue_rejection_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE(project_path, category, normalized_hash)
    );

CREATE INDEX idx_memories_project_status_category ON memories(project_path, status, category);

CREATE INDEX idx_memories_project_status_expires ON memories(project_path, status, expires_at);

CREATE INDEX idx_memories_project_category_hash ON memories(project_path, category, normalized_hash);

CREATE TABLE "memory_embeddings" (
                        memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
                        embedding BLOB NOT NULL,
                        model_id TEXT NOT NULL,
                        PRIMARY KEY(memory_id, model_id)
                    );

CREATE TABLE project_state (
      project_path TEXT PRIMARY KEY,
      project_memory_epoch INTEGER NOT NULL DEFAULT 0,
      project_user_profile_version INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
