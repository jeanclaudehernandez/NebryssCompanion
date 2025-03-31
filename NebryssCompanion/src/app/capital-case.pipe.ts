import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'capitalCase',
  standalone: true
})
export class CapitalCasePipe implements PipeTransform {

  transform(value: string): unknown {
    return value[0].toUpperCase() + value.slice(1);
  }

}
