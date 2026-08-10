-- Broadcast Engineering Shift Handover System PostgreSQL Schema
-- Database: PostgreSQL (Supabase Compatible)

-- Create custom types / enums
CREATE TYPE user_role AS ENUM ('Technician', 'Supervisor', 'Admin');
CREATE TYPE shift_type AS ENUM ('Morning', 'Afternoon', 'Night');
CREATE TYPE station_status AS ENUM ('OK', 'Fault', 'Maintenance', 'Off Air', 'Signal Loss', 'Emergency');
CREATE TYPE fault_priority AS ENUM ('Low', 'Medium', 'High', 'Critical');
CREATE TYPE fault_status AS ENUM ('Open', 'Working', 'Monitoring', 'Resolved', 'Escalated');
CREATE TYPE signal_method AS ENUM ('Fiber', 'Microwave', 'Satellite', 'IP', 'Cellular');
CREATE TYPE task_status AS ENUM ('Todo', 'In Progress', 'Completed', 'Overdue');
CREATE TYPE report_type AS ENUM ('Daily', 'Weekly', 'Monthly', 'Custom');

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'Technician',
    pin_hash TEXT, -- Hex or encrypted hash for signature PIN verification
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Stations Table
CREATE TABLE IF NOT EXISTS stations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    logo_url TEXT,
    current_status station_status NOT NULL DEFAULT 'OK',
    remarks TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Shifts Table
CREATE TABLE IF NOT EXISTS shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    shift_type shift_type NOT NULL,
    location TEXT NOT NULL DEFAULT 'Engineering',
    outgoing_staff_id UUID REFERENCES users(id) ON DELETE SET NULL,
    incoming_staff_id UUID REFERENCES users(id) ON DELETE SET NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Completed')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Attendance Table
CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    time_reported TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    time_leaving TIMESTAMP WITH TIME ZONE,
    hours_worked NUMERIC(5, 2) DEFAULT 0.0,
    is_late BOOLEAN NOT NULL DEFAULT FALSE,
    late_reason TEXT,
    supervisor_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Broadcast Status History Table
CREATE TABLE IF NOT EXISTS broadcast_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    station_id UUID NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    status station_status NOT NULL,
    remarks TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Faults Table (Section D)
CREATE TABLE IF NOT EXISTS faults (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    station_id UUID NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    category TEXT NOT NULL, -- e.g. Transmitter, Studio, Microwave, Power, Internet
    description TEXT NOT NULL,
    time_detected TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reported_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    priority fault_priority NOT NULL DEFAULT 'Medium',
    action_taken TEXT,
    assigned_engineer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status fault_status NOT NULL DEFAULT 'Open',
    resolved_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Fault Updates Table (Timeline log)
CREATE TABLE IF NOT EXISTS fault_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fault_id UUID NOT NULL REFERENCES faults(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status fault_status NOT NULL,
    action_taken TEXT,
    remarks TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Outside Broadcasts Table (Section E)
CREATE TABLE IF NOT EXISTS outside_broadcasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    is_running BOOLEAN NOT NULL DEFAULT TRUE,
    program_name TEXT NOT NULL,
    location TEXT NOT NULL,
    gps_coordinates TEXT,
    vehicle TEXT,
    technical_crew TEXT[], -- Array of technician names
    equipment_used TEXT[],
    signal_method signal_method NOT NULL DEFAULT 'IP',
    technical_issues TEXT,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Completed', 'Interrupted')),
    expected_end_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. Equipment Table
CREATE TABLE IF NOT EXISTS equipment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    station_id UUID REFERENCES stations(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'Operational' CHECK (status IN ('Operational', 'Needs Service', 'Faulty')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. Tasks Table (Section F)
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL,
    task_name TEXT NOT NULL,
    description TEXT,
    assigned_to_id UUID REFERENCES users(id) ON DELETE SET NULL,
    priority fault_priority NOT NULL DEFAULT 'Medium',
    due_date TIMESTAMP WITH TIME ZONE,
    station_id UUID REFERENCES stations(id) ON DELETE SET NULL,
    status task_status NOT NULL DEFAULT 'Todo',
    image_url TEXT,
    equipment_id UUID REFERENCES equipment(id) ON DELETE SET NULL,
    resolution_type TEXT CHECK (resolution_type IN ('repaired', 'replaced')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. Handovers Table
CREATE TABLE IF NOT EXISTS handovers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID UNIQUE NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    outgoing_staff_id UUID NOT NULL REFERENCES users(id),
    incoming_staff_id UUID NOT NULL REFERENCES users(id),
    handover_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    summary TEXT,
    outgoing_signature_url TEXT,
    incoming_signature_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 12. Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL means send to everyone (broadcast)
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL, -- 'fault_new', 'task_assign', 'shift_start', 'shift_end', 'critical_fault'
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 13. Reports Table
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type report_type NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    generated_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    summary TEXT,
    data JSONB NOT NULL, -- Full snapshot of the report data
    pdf_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 14. System Settings Table
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 15. Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL, -- e.g. 'CREATE_SHIFT', 'RESOLVE_FAULT'
    target_table TEXT NOT NULL,
    target_id UUID,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 16. Attachments Table
CREATE TABLE IF NOT EXISTS attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_type TEXT NOT NULL CHECK (parent_type IN ('Fault', 'OutsideBroadcast', 'Task')),
    parent_id UUID NOT NULL,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT NOT NULL,
    uploaded_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance optimization
CREATE INDEX idx_shifts_date ON shifts(date);
CREATE INDEX idx_faults_status ON faults(status);
CREATE INDEX idx_faults_priority ON faults(priority);
CREATE INDEX idx_faults_station_id ON faults(station_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to_id);
CREATE INDEX idx_tasks_equipment_id ON tasks(equipment_id);
CREATE INDEX idx_broadcast_status_shift ON broadcast_status(shift_id);
CREATE INDEX idx_attendance_shift ON attendance(shift_id);
CREATE INDEX idx_notifications_user ON notifications(user_id) WHERE is_read = FALSE;
CREATE INDEX idx_equipment_station ON equipment(station_id);

-- RLS (Row Level Security) Policies (Template for supabase setup)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE faults ENABLE ROW LEVEL SECURITY;
ALTER TABLE fault_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE outside_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

-- Select/Read Policies (Allow all authenticated users to read core data)
CREATE POLICY "Allow reading for users" ON users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow reading for stations" ON stations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow reading for shifts" ON shifts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow reading for attendance" ON attendance FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow reading for faults" ON faults FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow reading for fault_updates" ON fault_updates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow reading for outside_broadcasts" ON outside_broadcasts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow reading for tasks" ON tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow reading for handovers" ON handovers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow reading for notifications" ON notifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow reading for reports" ON reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow reading for settings" ON settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow reading for attachments" ON attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow select for equipment" ON equipment FOR SELECT USING (true);
CREATE POLICY "Allow insert for equipment" ON equipment FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update for equipment" ON equipment FOR UPDATE USING (true);

-- Storage bucket for equipment photos
INSERT INTO storage.buckets (id, name, public) VALUES ('equipment-photos', 'equipment-photos', true) ON CONFLICT (id) DO NOTHING;

-- Insert/Update/Delete roles restrictions would follow matching the role fields.
