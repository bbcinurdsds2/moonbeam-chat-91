-- Add DELETE policy to allow users to delete their own profiles
CREATE POLICY "Users can delete own profile" 
ON public.profiles 
FOR DELETE 
USING (auth.uid() = id);