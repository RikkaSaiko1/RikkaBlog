import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { AutoAwesomeRounded, DeleteOutlineRounded, EditRounded } from "@mui/icons-material";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminProject, adminApi, joinLines, splitLines } from "./adminApi";
import { AdminToolbar, EntityDialog, PublishStatusField, StateBlock, StatusChip } from "./AdminPrimitives";

type ProjectForm = { name: string; description: string; icon: string; githubUrl: string; tagsText: string; sortOrder: number; status: "draft" | "published" };
const emptyForm: ProjectForm = { name: "", description: "", icon: "", githubUrl: "", tagsText: "", sortOrder: 0, status: "published" };
const fromProject = (item?: AdminProject): ProjectForm => item ? { name: item.name, description: item.description ?? "", icon: item.icon ?? "", githubUrl: item.githubUrl ?? "", tagsText: joinLines(item.tags), sortOrder: item.sortOrder, status: item.status } : emptyForm;
const payload = (form: ProjectForm) => ({ name: form.name, description: form.description || null, icon: form.icon || null, githubUrl: form.githubUrl || null, tags: splitLines(form.tagsText), sortOrder: form.sortOrder, status: form.status });

export function ProjectManager() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminProject | null>(null);
  const [form, setForm] = useState<ProjectForm>(emptyForm);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState("");
  const query = useQuery({ queryKey: ["admin", "projects"], queryFn: adminApi.projects });
  const aiMutation = useMutation({
    mutationFn: () => adminApi.aiCompleteProject(aiText),
    onSuccess: (result) => {
      setAiOpen(false);
      setAiText("");
      setForm((prev) => ({
        ...prev,
        name: result.name || prev.name,
        description: result.description || prev.description,
        tagsText: result.tags.length > 0 ? result.tags.join("\n") : prev.tagsText,
        icon: result.icon || prev.icon,
        githubUrl: result.githubUrl || prev.githubUrl,
      }));
    },
  });
  const createMutation = useMutation({ mutationFn: adminApi.createProject, onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["admin", "projects"] }) });
  const updateMutation = useMutation({ mutationFn: ({ id, body }: { id: string; body: ReturnType<typeof payload> }) => adminApi.updateProject(id, body), onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["admin", "projects"] }) });
  const deleteMutation = useMutation({ mutationFn: adminApi.deleteProject, onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["admin", "projects"] }) });
  const items = query.data?.items ?? [];
  const filtered = useMemo(() => items.filter((item) => !search.trim() || [item.name, item.description, item.githubUrl, ...(item.tags ?? [])].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase())), [items, search]);
  const start = (item?: AdminProject) => { setEditing(item ?? null); setForm(fromProject(item)); setOpen(true); };
  const save = () => { const body = payload(form); const options = { onSuccess: () => setOpen(false) }; editing ? updateMutation.mutate({ id: editing.id, body }, options) : createMutation.mutate(body, options); };
  return (
    <Box>
      <AdminToolbar search={search} onSearch={setSearch} onRefresh={() => void query.refetch()} onCreate={() => start()} createLabel="新建项目" />
      <StateBlock loading={query.isLoading} error={query.error} empty={!query.isLoading && filtered.length === 0} />
      {filtered.length > 0 && <Paper variant="outlined"><Table size="small"><TableHead><TableRow><TableCell>项目</TableCell><TableCell>标签</TableCell><TableCell>排序</TableCell><TableCell>状态</TableCell><TableCell align="right">操作</TableCell></TableRow></TableHead><TableBody>{filtered.map((item) => <TableRow key={item.id} hover><TableCell><Typography sx={{ fontWeight: 800 }}>{item.icon ? (/^https?:\/\//i.test(item.icon) ? <Box component="img" src={item.icon} alt="" sx={{ width: 22, height: 22, borderRadius: "50%", mr: 0.75, verticalAlign: "middle", objectFit: "cover" }} /> : `${item.icon} `) : ""}{item.name}</Typography><Typography variant="caption" color="text.secondary">{item.description}</Typography></TableCell><TableCell><Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">{item.tags.map((tag) => <Chip key={tag} size="small" label={tag} />)}</Stack></TableCell><TableCell>{item.sortOrder}</TableCell><TableCell><StatusChip status={item.status} /></TableCell><TableCell align="right"><Button size="small" startIcon={<EditRounded />} onClick={() => start(item)}>编辑</Button><Button size="small" color="error" startIcon={<DeleteOutlineRounded />} onClick={() => deleteMutation.mutate(item.id)}>删除</Button></TableCell></TableRow>)}</TableBody></Table></Paper>}
      <EntityDialog open={open} title={editing ? "编辑项目" : "新建项目"} saving={createMutation.isPending || updateMutation.isPending} onClose={() => setOpen(false)} onSave={save}>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <TextField fullWidth label="名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} sx={{ flex: 1 }} />
            <TextField fullWidth label="图标" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} sx={{ flex: { md: "0 0 120px" } }} />
            <TextField fullWidth type="number" label="排序" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} sx={{ flex: { md: "0 0 120px" } }} />
          </Stack>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
            <Button size="small" startIcon={<AutoAwesomeRounded />} onClick={() => setAiOpen(true)}>
              AI 智能填充
            </Button>
            <Typography variant="caption" color="text.secondary">粘贴项目资料，AI 自动填写整个表单</Typography>
          </Stack>
          <TextField fullWidth label="描述" multiline minRows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <TextField fullWidth label="GitHub URL" value={form.githubUrl} onChange={(e) => setForm({ ...form, githubUrl: e.target.value })} />
          <TextField fullWidth label="标签（逗号或换行分隔）" multiline minRows={2} value={form.tagsText} onChange={(e) => setForm({ ...form, tagsText: e.target.value })} />
          <PublishStatusField value={form.status} onChange={(status) => setForm({ ...form, status })} />
        </Stack>
      </EntityDialog>
      <Dialog open={aiOpen} onClose={() => !aiMutation.isPending && setAiOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>AI 智能填充</DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
            把项目资料整体粘贴进来（项目介绍、README 片段、GitHub 链接等均可），AI 会自动提取名称、描述、标签、图标与仓库链接并填入表单。
          </Typography>
          <TextField fullWidth multiline minRows={6} autoFocus placeholder="粘贴项目资料…" value={aiText} onChange={(e) => setAiText(e.target.value)} />
          {aiMutation.isError && (
            <Alert severity="error" sx={{ mt: 1.5 }} onClose={() => aiMutation.reset()}>
              {aiMutation.error.message}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAiOpen(false)} disabled={aiMutation.isPending}>取消</Button>
          <Button
            variant="contained"
            startIcon={aiMutation.isPending ? <CircularProgress size={15} /> : <AutoAwesomeRounded />}
            disabled={!aiText.trim() || aiMutation.isPending}
            onClick={() => aiMutation.mutate()}
          >
            开始填充
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
