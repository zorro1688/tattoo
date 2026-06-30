drop policy if exists "Users can read their own design files" on storage.objects;
create policy "Users can read their own design files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'inkfirst-designs'
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "Users can upload their own design files" on storage.objects;
create policy "Users can upload their own design files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'inkfirst-designs'
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "Users can update their own design files" on storage.objects;
create policy "Users can update their own design files"
on storage.objects for update
to authenticated
using (
  bucket_id = 'inkfirst-designs'
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = auth.uid()::text
)
with check (
  bucket_id = 'inkfirst-designs'
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "Users can delete their own design files" on storage.objects;
create policy "Users can delete their own design files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'inkfirst-designs'
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = auth.uid()::text
);
