import { Alert, Box, Button, CircularProgress, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { AutoAwesomeRounded, DeleteOutlineRounded, EditRounded } from "@mui/icons-material";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminMoment, adminApi, AiPolishMomentMode, joinLines, splitLines } from "./adminApi";
import { AdminToolbar, EntityDialog, MarkdownEditor, PublishStatusField, StateBlock, StatusChip } from "./AdminPrimitives";
import { createMomentSlug } from "./momentSlug";

type MomentForm = { slug: string; contentMd: string; imagesText: string; status: "draft" | "published" };
const emptyForm: MomentForm = { slug: "", contentMd: "", imagesText: "", status: "published" };

function fromMoment(item?: AdminMoment): MomentForm {
  return item
    ? { slug: item.slug, contentMd: item.contentMd, imagesText: joinLines(item.images), status: item.status }
    : { ...emptyForm, slug: createMomentSlug() };
}

// 提取 Markdown 正文里内嵌的图片 URL（粘贴上传产生），随保存自动并入 images 字段
function extractImageUrls(md: string): string[] {
  const urls: string[] = [];
  const re = /!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(md))) urls.push(match[1]);
  return urls;
}

function payload(form: MomentForm) {
  const images = [...new Set([...splitLines(form.imagesText), ...extractImageUrls(form.contentMd)])];
  return { slug: form.slug, contentMd: form.contentMd, location: null, images, status: form.status };
}

export function MomentManager() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminMoment | null>(null);
  const [form, setForm] = useState<MomentForm>(emptyForm);
  const [aiMode, setAiMode] = useState<AiPolishMomentMode>("polish");
  const query = useQuery({ queryKey: ["admin", "moments"], queryFn: adminApi.moments });
  const aiMutation = useMutation({
    mutationFn: () => adminApi.aiPolishMoment(form.contentMd, aiMode),
    onSuccess: ({ contentMd }) => setForm((prev) => ({ ...prev, contentMd })),
  });
  const createMutation = useMutation({ mutationFn: adminApi.createMoment, onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["admin", "moments"] }) });
  const updateMutation = useMutation({ mutationFn: ({ id, body }: { id: string; body: ReturnType<typeof payload> }) => adminApi.updateMoment(id, body), onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["admin", "moments"] }) });
  const deleteMutation = useMutation({ mutationFn: adminApi.deleteMoment, onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["admin", "moments"] }) });
  const [imagesUploading, setImagesUploading] = useState(0);
  const [imagesError, setImagesError] = useState<string | null>(null);
  // 图片 URL 字段支持直接粘贴剪贴板图片：上传到 R2 后把返回 URL 追加到列表
  const handleImagesPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i += 1) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length === 0) return;
    event.preventDefault();
    setImagesUploading((count) => count + files.length);
    setImagesError(null);
    void Promise.all(files.map((file) => adminApi.uploadImage(file)))
      .then((results) => {
        const urls = results.map((r) => r.url);
        setForm((prev) => ({
          ...prev,
          imagesText: prev.imagesText.trim() ? `${prev.imagesText.replace(/\s+$/, "")}\n${urls.join("\n")}` : urls.join("\n"),
        }));
      })
      .catch((error) => {
        setImagesError(error instanceof Error ? error.message : "图片上传失败");
      })
      .finally(() => setImagesUploading(0));
  };
  const items = query.data?.items ?? [];
  const filtered = useMemo(() => items.filter((item) => !search.trim() || [item.slug, item.contentMd].join(" ").toLowerCase().includes(search.toLowerCase())), [items, search]);
  const start = (item?: AdminMoment) => {
    setEditing(item ?? null);
    setForm(fromMoment(item));
    setOpen(true);
  };
  const save = () => {
    const body = payload(form);
    const options = { onSuccess: () => setOpen(false) };
    if (editing) updateMutation.mutate({ id: editing.id, body }, options);
    else createMutation.mutate(body, options);
  };
  return (
    <Box>
      <AdminToolbar search={search} onSearch={setSearch} onRefresh={() => void query.refetch()} onCreate={() => start()} createLabel="新建瞬间" />
      <StateBlock loading={query.isLoading} error={query.error} empty={!query.isLoading && filtered.length === 0} />
      {filtered.length > 0 && (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead><TableRow><TableCell>内容</TableCell><TableCell>图片</TableCell><TableCell>状态</TableCell><TableCell>更新</TableCell><TableCell align="right">操作</TableCell></TableRow></TableHead>
            <TableBody>
              {filtered.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell><Typography sx={{ fontWeight: 800 }}>{item.slug}</Typography><Typography variant="caption" color="text.secondary">{item.contentMd.slice(0, 80)}</Typography></TableCell>
                  <TableCell>{item.images.length}</TableCell>
                  <TableCell><StatusChip status={item.status} /></TableCell>
                  <TableCell>{new Date(item.updatedAt).toLocaleString("zh-CN")}</TableCell>
                  <TableCell align="right"><Button size="small" startIcon={<EditRounded />} onClick={() => start(item)}>编辑</Button><Button size="small" color="error" startIcon={<DeleteOutlineRounded />} onClick={() => deleteMutation.mutate(item.id)}>删除</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
      <EntityDialog open={open} title={editing ? "编辑瞬间" : "新建瞬间"} saving={createMutation.isPending || updateMutation.isPending} onClose={() => setOpen(false)} onSave={save}>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <TextField fullWidth label="Slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} sx={{ flex: 1 }} />
            <PublishStatusField value={form.status} onChange={(status) => setForm({ ...form, status })} sx={{ flex: { md: "0 0 150px" } }} />
          </Stack>
          <TextField
            fullWidth
            label="图片 URL（逗号或换行分隔）"
            multiline
            minRows={3}
            value={form.imagesText}
            onChange={(e) => setForm({ ...form, imagesText: e.target.value })}
            onPaste={handleImagesPaste}
            error={Boolean(imagesError)}
            helperText={imagesUploading > 0 ? `正在上传 ${imagesUploading} 张图片…` : imagesError ?? "可直接粘贴剪贴板图片，自动上传后填入 URL"}
          />
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
            <ToggleButtonGroup size="small" exclusive value={aiMode} onChange={(_, value: AiPolishMomentMode | null) => value && setAiMode(value)}>
              <ToggleButton value="polish">润色</ToggleButton>
              <ToggleButton value="expand">扩写</ToggleButton>
              <ToggleButton value="condense">精简</ToggleButton>
            </ToggleButtonGroup>
            <Button
              size="small"
              startIcon={aiMutation.isPending ? <CircularProgress size={15} /> : <AutoAwesomeRounded />}
              disabled={!form.contentMd.trim() || aiMutation.isPending}
              onClick={() => aiMutation.mutate()}
            >
              AI 润色
            </Button>
          </Stack>
          {aiMutation.isError && <Alert severity="error" onClose={() => aiMutation.reset()}>{aiMutation.error.message}</Alert>}
          <MarkdownEditor label="Markdown 内容" value={form.contentMd} onChange={(value) => setForm({ ...form, contentMd: value })} minRows={6} extraPreviewImages={splitLines(form.imagesText)} />
        </Stack>
      </EntityDialog>
    </Box>
  );
}
