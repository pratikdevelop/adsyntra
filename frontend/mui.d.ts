import { SystemProps } from '@mui/system';
import { Theme } from '@mui/material/styles';

declare module '@mui/material/Stack' {
  interface StackOwnProps extends SystemProps<Theme> {}
}
